"""Build the valley's CC0 material derivatives and compact glTF meshes.

Usage: python scripts/valley/prepare.py /path/to/download-cache
Requires Python 3, NumPy, Pillow with WebP, and Blender 4.3.2.
"""
import hashlib
import io
import json
import math
from pathlib import Path
import random
import struct
import subprocess
import sys
import urllib.request

from radiance import reduce_panorama
import numpy as np
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/valley"
CACHE = Path(sys.argv[1]).resolve()
SOURCES = json.loads((Path(__file__).parent / "sources.json").read_text())


def fetch():
    for path, record in SOURCES.items():
        dest = CACHE / path
        if not dest.exists() or hashlib.sha256(dest.read_bytes()).hexdigest() != record["sha256"]:
            dest.parent.mkdir(parents=True, exist_ok=True)
            request = urllib.request.Request(record["url"], headers={"User-Agent": "Zyberlane-XR-valley/offline-art-build"})
            data = urllib.request.urlopen(request, timeout=90).read()
            if hashlib.sha256(data).hexdigest() != record["sha256"]:
                raise ValueError("Source bytes changed: " + path)
            dest.write_bytes(data)


def image(path):
    return Image.open(CACHE / path).convert("RGB")


def webp(img, size, quality):
    img = img.copy()
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    img.save(out, "WEBP", quality=quality, method=6)
    return out.getvalue()


class Glb:
    def __init__(self):
        self.bin = bytearray()
        self.doc = {"asset": {"version": "2.0", "generator": "Zyberlane valley asset preparation"},
                    "extensionsUsed": ["EXT_texture_webp"], "extensionsRequired": ["EXT_texture_webp"],
                    "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
                    "meshes": [{"primitives": []}], "materials": [], "textures": [], "images": [],
                    "bufferViews": [], "accessors": []}

    def view(self, payload):
        self.bin.extend(b'\0' * (-len(self.bin) % 4))
        offset = len(self.bin)
        self.bin.extend(payload)
        views = self.doc["bufferViews"]
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(payload)})
        return len(views) - 1

    def accessor(self, values, kind):
        data = np.asarray(values, dtype="<u2" if kind == "SCALAR" else "<f4")
        acc = {"bufferView": self.view(data.tobytes()), "componentType": 5123 if kind == "SCALAR" else 5126,
               "count": len(data), "type": kind}
        if kind == "VEC3":
            acc.update(min=data.min(axis=0).tolist(), max=data.max(axis=0).tolist())
        self.doc["accessors"].append(acc)
        return len(self.doc["accessors"]) - 1

    def texture(self, img, res, q=82):
        view = self.view(webp(img, res, q))
        images = self.doc["images"]
        images.append({"bufferView": view, "mimeType": "image/webp"})
        textures = self.doc["textures"]
        textures.append({"extensions": {"EXT_texture_webp": {"source": len(images) - 1}}})
        return {"index": len(textures) - 1}

    def material(self, name, color, res, normal=None, rough=None, masked=False):
        pbr = {"baseColorTexture": self.texture(color, res), "metallicFactor": 0.0, "roughnessFactor": 1.0}
        mat = {"name": name, "pbrMetallicRoughness": pbr}
        if normal:
            mat["normalTexture"] = self.texture(normal, res // 2, 92)
        if rough:
            pbr["metallicRoughnessTexture"] = self.texture(rough, res // 2)
        if masked:
            mat.update(alphaMode="MASK", alphaCutoff=.24, doubleSided=True)
        self.doc["materials"].append(mat)
        return len(self.doc["materials"]) - 1

    def mesh(self, points, normals, uv, indices, material):
        if len(points) > 65535:
            raise ValueError("Split large meshes before writing uint16 indices")
        attrs = {"POSITION": self.accessor(points, "VEC3"), "NORMAL": self.accessor(normals, "VEC3"),
                 "TEXCOORD_0": self.accessor(uv, "VEC2")}
        self.doc["meshes"][0]["primitives"].append({"attributes": attrs, "material": material,
                                                     "indices": self.accessor(indices, "SCALAR")})

    def save(self, name):
        self.doc["buffers"] = [{"byteLength": len(self.bin)}]
        desc = json.dumps(self.doc, separators=(",", ":")).encode()
        desc += b' ' * (-len(desc) % 4)
        self.bin.extend(b'\0' * (-len(self.bin) % 4))
        (OUT/name).write_bytes(struct.pack("<4sII", b'glTF', 2, 28+len(desc)+len(self.bin)) +
                               struct.pack("<I4s", len(desc), b'JSON') + desc +
                               struct.pack("<I4s", len(self.bin), b'BIN\0') + self.bin)


def scanned(name, variant, dest, alpha=False):
    path = CACHE / name
    doc = json.loads((path / (name + ".gltf")).read_text())
    primitive = doc["meshes"][variant]["primitives"][0]
    bin_data = (path / doc["buffers"][0]["uri"]).read_bytes()

    def read(index):
        acc = doc["accessors"][index]
        view = doc["bufferViews"][acc["bufferView"]]
        dtype = {5126: "<f4", 5123: "<u2", 5125: "<u4"}[acc["componentType"]]
        n = {"VEC3": 3, "VEC2": 2, "SCALAR": 1}[acc["type"]]
        if "byteStride" in view:
            raise ValueError("Source changed to interleaved glTF")
        a = np.frombuffer(bin_data, dtype=dtype, offset=view.get("byteOffset", 0)+acc.get("byteOffset", 0),
                          count=acc["count"]*n)
        return a.reshape((-1, n)) if n > 1 else a

    pos, normal, uv = [read(primitive["attributes"][k]) for k in ["POSITION", "NORMAL", "TEXCOORD_0"]]
    g = Glb()
    if alpha:
        images = {k:image(name + "/textures/" + name + "_" + k + "_1k.jpg") for k in ["diff","nor_gl","arm"]}
        images["diff"].putalpha(image(name+"/Alpha.jpg").convert("L"))
        mat = g.material(name,images["diff"],512,images["nor_gl"],images["arm"],True)
    else:
        # All six boulders share a 4K atlas. Reassign only the chosen boulder's tile
        # to the full 1K hero image, preserving 2-pixel dilation at the tile edges.
        size=4096
        left,top=np.maximum(0,np.floor(uv.min(0)*size).astype(int)-2)
        right,bottom=np.minimum(size,np.ceil(uv.max(0)*size).astype(int)+2)
        rect=tuple(map(int,[left,top,right,bottom]))
        images=[image(name+"/hero-"+k+".jpg").crop(rect) for k in ["Diffuse","nor_gl","Rough"]]
        uv=np.clip((uv*size-[left,top])/[right-left,bottom-top],0.0005,.9995)
        mat=g.material(name,images[0],1024,images[1],images[2])
        for suffix,img in zip(["color","normal","rough"],images):
            img.save(CACHE/("cropped-boulder-"+suffix+".png"))
    pos = pos.copy()
    center = (pos.min(0) + pos.max(0)) / 2
    center[1] = pos[:, 1].min()
    pos -= center
    g.mesh(pos, normal, uv, read(primitive["indices"]), mat)
    g.save(dest)


def make_tree():
    """Original whorled spruce with tapered bark limbs and scanned needle sprays."""
    rand = random.Random(103)
    g = Glb()
    bark = g.material("Fir bark", image("fir_tree_01/bark_diff.jpg"), 512, image("fir_tree_01/bark_nor_gl.jpg"))
    needles = image("fir_tree_01/twig_diff.jpg")
    needles.putalpha(image("fir_tree_01/twig_alpha.jpg").convert("L"))
    # Restrict UVs to a single, full photographed spruce shoot from the source atlas.
    needles = needles.crop((304, 391, 666, 801))
    foliage = g.material("Fir needle sprays", needles, 384, masked=True)
    woody, foliage_mesh = ([], [], [], []), ([], [], [], [])
    Y = np.array([0., 1., 0.])

    def limb(start, end, r0, r1, sides=5):
        direction = end - start
        unit = direction / np.linalg.norm(direction)
        ref = np.array([0., 0., 1.]) if abs(unit[1]) > .94 else Y
        vx = np.cross(unit, ref)
        vx /= np.linalg.norm(vx)
        vy = np.cross(unit, vx)
        p, n, uv, idx = woody
        base = len(p)
        for level, (center, radius) in enumerate([(start, r0), (end, r1)]):
            for i in range(sides+1):
                a = math.tau*i/sides
                normal = vx*math.cos(a)+vy*math.sin(a)
                p.append(center + radius*normal); n.append(normal); uv.append([i/sides, (1-level)*np.linalg.norm(direction)])
        for i in range(sides):
            a = base+i
            idx.extend([a,a+1,a+sides+1, a+1,a+sides+2,a+sides+1])

    def shoot(start, end, lateral, width):
        p, n, uv, idx = foliage_mesh
        base = len(p)
        for j, (t, half) in enumerate([(0,.65),(.5,1.),(1,.76)]):
            center = start*(1-t)+end*t + Y*(.07*math.sin(t*math.pi))
            for sign in [-1,1]:
                p.append(center + lateral*width*half*sign)
                norm = Y + lateral*(.42*sign)
                n.append(norm/np.linalg.norm(norm)); uv.append([(sign+1)/2,1-t])
        idx.extend(base+x for x in [0,2,1,1,2,3,2,4,3,3,4,5])

    height = 8.4
    def axis(h):
        return np.array([.11*math.sin(h*.41), h, .08*math.sin(h*.67)])
    def radius(h):
        return .145*(1-h/height)**.78+.009
    for j in range(10):
        a,b=height*j/10,height*(j+1)/10
        limb(axis(a),axis(b),radius(a),radius(b),10)
    for ring in range(16):
        y=height*(.13+.85*ring/16)
        count=max(3,round(8-ring*.21))
        for j in range(count):
            angle=math.tau*(j/count+ring*.271)+rand.uniform(-.25,.25)
            rad=np.array([math.cos(angle),0.,math.sin(angle)])
            side=np.array([-rad[2],0.,rad[0]])
            h=y+rand.uniform(-.16,.16)
            start=axis(h)
            length=(1-h/height)**.8*2.15*rand.uniform(.80,1.26)
            def point(t):
                return start+rad*length*t+Y*length*(-.19*math.sin(t*math.pi)+.13*t*t)
            limb(start,point(.50),.040*length,.017*length)
            limb(point(.50),point(1),.017*length,.004)
            for k in range(6):
                t=.09+.142*k
                for sign in [-1,1]:
                    root=point(t)
                    out=rad*(.33+.24*t)+sign*side*(.64-.32*t)+Y*rand.uniform(-.18,.16)
                    size=length*(.47-.16*t)*rand.uniform(.85,1.2)
                    tilt=side*(.45+rand.random()*.3)+Y*rand.uniform(-.65,.65)
                    shoot(root,root+out*size,tilt,.26*size)
            shoot(point(.80), point(1.12)+Y*.07,side,.11*length)
    g.mesh(*woody,bark);g.mesh(*foliage_mesh,foliage);g.save("tree.glb")


def bake_broadleaf():
    path=CACHE/"tree_small_02"
    doc=json.loads((path/"tree_small_02.gltf").read_text())
    leaf=next(i for i in doc["images"] if "leaves_diff" in i["uri"])
    rgba=Image.open(path/leaf["uri"]).convert("RGBA")
    rgba.putalpha(Image.open(path/"leaves_alpha.jpg").convert("L"))
    rgba.save(path/"leaf-rgba.png")
    leaf.update(uri="leaf-rgba.png",mimeType="image/png")
    doc["materials"][1].update(alphaMode="MASK",alphaCutoff=.35)
    gltf=path/"bake.gltf"
    gltf.write_text(json.dumps(doc))
    tmp=CACHE/"broadleaf.png"
    subprocess.run(["blender","-b","-t","3","--python",str(Path(__file__).with_name("bake_impostor.py")),
                    "--",str(tmp),str(gltf)],check=True,stdout=subprocess.DEVNULL)
    (OUT/"broadleaf.webp").write_bytes(webp(Image.open(tmp),640,88))


def alpine_backdrop():
    pano=Image.open(CACHE/"lago_disola/tonemapped.jpg")
    pano.draft("RGB",(2048,1024))
    pano=pano.convert("RGB").resize((2048,1024),Image.Resampling.LANCZOS)
    # Put the distant snowy pass at azimuth -Z (u=.25 in Three equirectangular coordinates).
    pano=ImageChops.offset(pano,-round(.455*pano.width),0)
    (OUT/"alpine-panorama.webp").write_bytes(webp(pano,2048,89))
    reduce_panorama(CACHE/"lago_disola/2k.hdr",OUT/"sky-light.hdr",256,-.455)


def main():
    fetch()
    OUT.mkdir(parents=True,exist_ok=True)
    for prefix, name, maps in [("ground","forest_ground_04",("Diffuse","nor_gl","Rough")),
                               ("rock","rock_face",("Diffuse","nor_gl"))]:
        for kind, suffix in zip(maps, ("color","normal","rough")):
            im = image(f"{name}/{kind}.jpg")
            res = 1024 if suffix == "color" else 512
            if suffix == "rough": im=im.convert("L")
            (OUT/f"{prefix}-{suffix}.webp").write_bytes(webp(im,res,88 if suffix=="normal" else 80))
    moss=image("aerial_grass_rock/Diffuse.jpg")
    (OUT/"moss-color.webp").write_bytes(webp(moss,1024,80))
    (OUT/"low").mkdir(exist_ok=True)
    for file in ["ground-color","ground-normal","ground-rough","rock-color","rock-normal","moss-color"]:
        size=512 if file.endswith("color") else 256
        (OUT/"low"/(file+".webp")).write_bytes(webp(Image.open(OUT/(file+".webp")),size,82))
    scanned("rock_moss_set_01",2,"boulder.glb")
    scanned("fern_02",2,"fern.glb",True)
    simplified = CACHE / "rock-lod-geometry.json"
    subprocess.run(["blender","-b","-t","2","--python",str(Path(__file__).with_name("rock_lod.py")),
                    "--",str(OUT/"boulder.glb"),str(simplified)], check=True,stdout=subprocess.DEVNULL)
    geometry=json.loads(simplified.read_text())
    g=Glb()
    mat=g.material("Shoreline moss rock",image("cropped-boulder-color.png"),256,
                   image("cropped-boulder-normal.png"),image("cropped-boulder-rough.png"))
    g.mesh(*geometry,mat)
    g.save("boulder-low.glb")
    make_tree()
    tmp = CACHE/"tree-impostor.png"
    subprocess.run(["blender","-b","-t","4","--python",str(Path(__file__).with_name("bake_impostor.py")),
                    "--",str(tmp)],check=True,stdout=subprocess.DEVNULL)
    (OUT/"tree-impostor.webp").write_bytes(webp(Image.open(tmp),768,88))
    bake_broadleaf()
    alpine_backdrop()


if __name__ == "__main__":
    main()
