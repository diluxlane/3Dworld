"""Run inside Blender after prepare.py; see docs/assets/VALLEY.md."""
import bpy
from mathutils import Vector
from pathlib import Path
import sys

output = Path(sys.argv[sys.argv.index('--')+1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
args=sys.argv[sys.argv.index('--')+1:]
broadleaf=len(args)>1
src=Path(args[1]).resolve() if broadleaf else Path(__file__).resolve().parents[2]/'public/valley/tree.glb'
bpy.ops.import_scene.gltf(filepath=str(src))
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 8
scene.cycles.use_denoising = False
scene.cycles.transparent_max_bounces = 20
scene.world = bpy.data.worlds.new("Ambient overcast fill")
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.72,.81,.87,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .7
bpy.ops.object.light_add(type='SUN',location=(-4,-8,10))
sun=bpy.context.object
sun.data.energy=3.0
sun.data.angle=.13
sun.rotation_euler=Vector((.35,.62,-.82)).to_track_quat('-Z','Y').to_euler()
# Keep the height and base fixed, with transparent clearance above and beside the crown.
bpy.ops.object.camera_add(location=(0,-22,4.3))
cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,4.3))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'
cam.data.ortho_scale=9
scene.camera=cam
scene.render.resolution_x=512
scene.render.resolution_y=768
if broadleaf:
    cam.location=(13,-1,2.32)
    cam.rotation_euler=(Vector((0,-.74,2.32))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=4.95
    scene.render.resolution_x=640
    scene.render.resolution_y=640
scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGBA'
scene.render.filepath=str(output)
bpy.ops.render.render(write_still=True)
