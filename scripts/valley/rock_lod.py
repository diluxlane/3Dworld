"""Blender CLI helper: simplify a scan with UV seams, export corner attributes."""
import bpy
import json
from pathlib import Path
import sys

src, dest = sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH')
dec = obj.modifiers.new('Shoreline LOD', 'DECIMATE')
dec.ratio = .060
dec.use_collapse_triangulate = True
deps = bpy.context.evaluated_depsgraph_get()
evaluated = obj.evaluated_get(deps)
mesh = evaluated.to_mesh()
mesh.calc_loop_triangles()
verts, normals, uv, indices = [], [], [], []
lookup = {}
def y_up(v):
    return (v.x,v.z,-v.y)
for tri in mesh.loop_triangles:
    for corner in tri.loops:
        vi = mesh.loops[corner].vertex_index
        v = mesh.vertices[vi]
        tex = mesh.uv_layers.active.data[corner].uv
        key = (vi,round(tex.x,7),round(tex.y,7))
        if key not in lookup:
            lookup[key]=len(verts)
            verts.append(y_up(v.co));normals.append(y_up(v.normal));uv.append((tex.x,1-tex.y))
        indices.append(lookup[key])
Path(dest).write_text(json.dumps([verts,normals,uv,indices]))
