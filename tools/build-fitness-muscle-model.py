# 生成健身示范用的「肌肉男」人体模型（2026-11-03 建，肩推深色样品用）。
# 素材：MakeHuman 社区 MPFB2（https://github.com/makehumancommunity/mpfb2）的人体网格、体型变形、mixamo 骨架，
#   授权 CC0 1.0（该仓库 LICENSE.ASSETS.md），渲染图可放公开仓库。MPFB 代码是 GPL，只在本机生成时用，不进产出。
# 跑法：pip install bpy（Blender 当 Python 模块）；git clone mpfb2；
#   BLENDER_USER_RESOURCES=<暂存目录> python3 tools/build-fitness-muscle-model.py <mpfb2/src 路径> .photos/fitness-model/Muscle.glb 0.15
# 最后一个参数是体脂（weight），越小越精瘦。产出放 .photos/（gitignore），渲染时 MODEL=Muscle。

import sys, os, bpy, bmesh, importlib, addon_utils
from mathutils import Vector
SRC=sys.argv[-3]; OUT=sys.argv[-2]; WEIGHT=float(sys.argv[-1])
ext=bpy.utils.user_resource('EXTENSIONS', path='user_default', create=True)
dst=os.path.join(ext,'mpfb')
if not os.path.exists(dst): os.symlink(os.path.join(SRC,'mpfb'), dst)
addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
P='bl_ext.user_default.mpfb.services.'
HumanService=importlib.import_module(P+'humanservice').HumanService
TargetService=importlib.import_module(P+'targetservice').TargetService
LocationService=importlib.import_module(P+'locationservice').LocationService
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
macro={"gender":1.0,"age":0.5,"muscle":1.0,"weight":WEIGHT,"proportions":1.0,"height":0.6,"cupsize":0.5,"firmness":0.5,"race":{"asian":0.33,"caucasian":0.34,"african":0.33}}
h=HumanService.create_human(macro_detail_dict=macro)
T=LocationService.get_mpfb_data("targets")
extra={"torso/torso-muscle-pectoral-incr":0.6,"torso/torso-muscle-dorsi-incr":0.7,"torso/torso-vshape-incr":0.5,
 "stomach/stomach-tone-incr":0.0,
 "arms/l-upperarm-muscle-incr":0.6,"arms/r-upperarm-muscle-incr":0.6,
 "arms/l-upperarm-shoulder-muscle-incr":0.7,"arms/r-upperarm-shoulder-muscle-incr":0.7,
 "arms/l-lowerarm-muscle-incr":0.5,"arms/r-lowerarm-muscle-incr":0.5,
 "legs/l-upperleg-muscle-incr":0.5,"legs/r-upperleg-muscle-incr":0.5,
 "legs/l-lowerleg-muscle-incr":0.5,"legs/r-lowerleg-muscle-incr":0.5,
 "neck/neck-scale-depth-incr":0.3}
for k,w in extra.items():
    f=os.path.join(T,k+".target.gz")
    if w>0 and os.path.exists(f): TargetService.load_target(h,f,weight=w)
    elif w>0: print("MISSING",f)
rig=HumanService.add_builtin_rig(h,"mixamo")
# bake shape keys
me=h.data
if me.shape_keys:
    mix=h.shape_key_add(name='mix',from_mix=True)
    co=[v.co.copy() for v in mix.data]
    h.shape_key_clear()
    for v,c in zip(me.vertices,co): v.co=c
# delete non-body verts
gi=h.vertex_groups['body'].index
bm=bmesh.new(); bm.from_mesh(me); dl=bm.verts.layers.deform.verify()
bm.verts.ensure_lookup_table()
kill=[v for v in bm.verts if gi not in v[dl]]
bmesh.ops.delete(bm,geom=kill,context='VERTS'); bm.to_mesh(me); bm.free()
for m in list(h.modifiers):
    if m.type=='MASK': h.modifiers.remove(m)
# drop non-bone vertex groups
bones={b.name for b in rig.data.bones}
for g in list(h.vertex_groups):
    if g.name not in bones: h.vertex_groups.remove(g)
# rename bones mixamorig:X -> mixamorigX ; vertex groups follow automatically
for b in rig.data.bones: b.name=b.name.replace(':','')
bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
eb=rig.data.edit_bones
def addend(parent,name,vec):
    p=eb[parent]; n=eb.new(name); n.head=p.tail.copy(); n.tail=p.tail+vec; n.parent=p; n.use_connect=False
hl=(eb['mixamorigHead'].tail-eb['mixamorigHead'].head)
addend('mixamorigHead','mixamorigHeadTop_End',hl.normalized()*0.05)
for s in ('Left','Right'):
    t=eb['mixamorig%sToeBase'%s]; addend('mixamorig%sToeBase'%s,'mixamorig%sToe_End'%s,(t.tail-t.head).normalized()*0.03)
for side,sg in (('Left',1),('Right',-1)):
    s_=(eb['mixamorig%sHandIndex1'%side].head-eb['mixamorig%sHandPinky1'%side].head)
    for f in ('Index','Middle','Ring','Pinky','Thumb'):
        for k in (1,2,3):
            b=eb['mixamorig%sHand%s%d'%(side,f,k)]
            a=(b.tail-b.head).normalized()
            n=(a.cross(s_) if sg>0 else s_.cross(a)).normalized()
            if f=='Thumb': b.align_roll(n)
            else: b.align_roll(n.cross(a))
print("BONES",[(b.name,tuple(round(x,3) for x in b.head)) for b in eb if b.name.endswith(('Hips','Head','HeadTop_End','LeftHand','LeftToe_End','LeftUpLeg'))])
bpy.ops.object.mode_set(mode='OBJECT')
# shorts: faces weighted to hips/uplegs/spine, z within band
mw=h.matrix_world
names={g.index:g.name for g in h.vertex_groups}
hipz=(rig.matrix_world@rig.data.bones['mixamorigHips'].head_local).z
lu=rig.data.bones['mixamorigLeftUpLeg']; kz=(rig.matrix_world@lu.tail_local).z; uz=(rig.matrix_world@lu.head_local).z
zlo=uz-(uz-kz)*0.45; zhi=hipz+(hipz-uz)*1.8
print("Z",hipz,uz,kz,zlo,zhi)
ok=set()
for v in me.vertices:
    z=(mw@v.co).z
    if not (zlo<z<zhi): continue
    s=sum(g.weight for g in v.groups if any(t in names[g.group] for t in ('Arm','Hand','Shoulder')))
    if s<0.02: ok.add(v.index)
sh=h.copy(); sh.data=me.copy(); sh.name='Shorts'; sh.data.name='Shorts'
bpy.context.collection.objects.link(sh)
bm=bmesh.new(); bm.from_mesh(sh.data)
bm.faces.ensure_lookup_table()
dead=[f for f in bm.faces if not all(v.index in ok for v in f.verts)]
bmesh.ops.delete(bm,geom=dead,context='FACES')
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bm.normal_update()
for v in bm.verts: v.co+=v.normal*0.008/ max(h.scale)  # local units
bm.to_mesh(sh.data); bm.free()
print("SHORTS verts",len(sh.data.vertices))
h.name='Body'; h.data.name='Body'
for o in bpy.data.objects: o.select_set(o in (h,sh,rig))
for o in bpy.data.objects: print("OBJ",o.name,o.type,tuple(o.scale),[m.type for m in o.modifiers] if o.type=='MESH' else '')
bpy.ops.export_scene.gltf(filepath=OUT,export_format='GLB',use_selection=True,export_skins=True,export_animations=False,export_morph=False,export_apply=False,export_materials='NONE',export_yup=True)
print("DONE",OUT)
