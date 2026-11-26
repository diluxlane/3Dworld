"""Record exact release file sizes, image dimensions, geometry counts, provenance and hashes."""
from pathlib import Path
import hashlib
import io
import json
import struct
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"public/valley"
RECORDS=ROOT/"docs/assets"
SOURCES=json.loads((Path(__file__).with_name("sources.json")).read_text())
GROUPS=[
    ("Forest Ground 04","forest_ground_04",["Rob Tuytel (photography and processing)","Rico Cilliers (minor adjustment)"],
     ["ground-color.webp","ground-normal.webp","ground-rough.webp"],"Three 1K JPEG PBR maps","Dry forest gravel. The route combines this with moss on sheltered banks."),
    ("Rock Face","rock_face",["Greg Zaal (photography)","Dario Barresi (processing)"],
     ["rock-color.webp","rock-normal.webp"],"Two 1K JPEG PBR maps","Tiling cliff material. Macro color repetition is visible if scale is excessive."),
    ("Aerial Grass Rock","aerial_grass_rock",["Rob Tuytel"],["moss-color.webp"],
     "1K JPEG base color","Moss, grass and rock seen from above. Macro ground color rather than individual grass blades."),
    ("Moss Rock Set 01","rock_moss_set_01",["Kless Gyzen"],["boulder.glb","boulder-low.glb"],
     "glTF, external geometry buffer, three 4K JPEG maps","One selected scan from the set of six; repeated placements share its silhouette."),
    ("Fern 02","fern_02",["Rob Tuytel (scanning)","Rico Cilliers (modeling)"],["fern.glb"],
     "glTF, external geometry buffer, three 1K JPEG maps and 1K alpha map","One clump selected from the set. Cutout geometry is appropriate below eye level."),
    ("Fir Tree 01 texture components","fir_tree_01",["Rob Tuytel (photography)","Rico Cilliers (modeling)"],
     ["tree.glb","tree-impostor.webp"],"Four 1K JPEG maps","Original gallery trunk/branch mesh with scanned needles and bark; one orthographic foliage view for distant use."),
    ("Tree Small 02","tree_small_02",["Rico Cilliers"],["broadleaf.webp"],
     "glTF, external geometry buffer, nine JPEG maps and 1K leaf alpha","Orthographic bake of the original wild syringa. Background foliage only. Flat under lateral inspection."),
    ("Lago d’Isola","lago_disola",["Andreas Mischok"],["alpine-panorama.webp","sky-light.hdr"],
     "8192 × 4096 tone-mapped panorama and 2K Radiance HDR exposure","Photographic distant mountains and matched HDR lighting. Foreground valley terrain occludes the source lake’s winter shoreline.")
]

def file_info(rel):
    data=(OUT/rel).read_bytes()
    item={"path":"public/valley/"+rel,"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}
    if rel.endswith(".glb"):
        json_len=struct.unpack_from("<I",data,12)[0]
        doc=json.loads(data[20:20+json_len])
        start=28+json_len
        if struct.unpack_from("<I",data,8)[0]!=len(data):
            raise ValueError(rel+" failed length validation")
        images=[]
        for img in doc["images"]:
            view=doc["bufferViews"][img["bufferView"]]
            at=start+view.get("byteOffset",0)
            dims=Image.open(io.BytesIO(data[at:at+view["byteLength"]])).size
            images.append({"mimeType":img["mimeType"],"width":dims[0],"height":dims[1]})
        item.update(format="glTF 2.0 binary, EXT_texture_webp",textures=images,
                    triangles=sum(doc["accessors"][p["indices"]]["count"]//3 for m in doc["meshes"] for p in m["primitives"]))
    elif rel.endswith(".hdr"):
        meta=data.split(b"\n\n",1)[1].split(b"\n",1)[0].split()
        item.update(format="Radiance RGBE",width=int(meta[3]),height=int(meta[1]))
    else:
        im=Image.open(io.BytesIO(data))
        item.update(format="WebP",width=im.width,height=im.height)
    return item


def main():
    records=[]
    for name,slug,authors,files,original,limits in GROUPS:
        paths=files+["low/"+f for f in files if (OUT/"low"/f).exists()]
        inputs={k:v for k,v in SOURCES.items() if k.startswith(slug+"/")}
        records.append({
            "name":name,"authors":authors,"url":"https://polyhaven.com/a/"+slug,
            "license":"CC0-1.0","licenseUrl":"https://polyhaven.com/license","scene":"Portal Valley",
            "attributionRequired":False,"commercialReuse":True,"redistribution":"Permitted, including edited assets.",
            "originalFormat":original,"sourceBytes":sum(r["sourceBytes"] for r in inputs.values()),
            "sourceFiles":list(inputs),"optimizedFiles":[file_info(p) for p in paths],"limitations":limits
        })
    RECORDS.mkdir(exist_ok=True,parents=True)
    (RECORDS/"valley-manifest.json").write_text(json.dumps(records,indent=2)+"\n")
    print("| Asset | Original source | License | Source bytes | Optimized bytes | Texture format | Scene |")
    print("| --- | --- | --- | ---: | ---: | --- | --- |")
    for rec in records:
        size=sum(it["bytes"] for it in rec["optimizedFiles"])
        fmt="WebP + RGBE" if rec["name"]=="Lago d’Isola" else "WebP"
        print(f"| {rec['name']} | [Poly Haven]({rec['url']}) | CC0 | {rec['sourceBytes']:,} | {size:,} | {fmt} | Portal Valley |")
    print("Total derivative bytes:",sum(it["bytes"] for rec in records for it in rec["optimizedFiles"]))

if __name__=="__main__":
    main()
