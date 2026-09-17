"""
tools/bake/render_kit_topview.py — esp32cam-2wd 교구의 탑뷰 스프라이트 프리렌더.

빌드 단계 스크립트다. 앱 실행에는 필요 없고, 결과 PNG 만 커밋한다.
    python3 -m pip install bpy
    python3 tools/bake/render_kit_topview.py

규칙
  - 정투영 수직 탑뷰. 원근 투영을 쓰면 위치에 따라 차량이 기울어 보인다.
  - 카메라와 광원은 월드에 고정하고 차량만 회전시킨다.
    카메라를 돌리면 그림자 방향까지 같이 돌아 부자연스러워진다.
  - 0도 = 차량 전방이 +x(화면 오른쪽). 16방향, 22.5도 간격.
  - 본체와 그림자를 분리 렌더한다. 트랙 색이 바뀌어도 그림자를 자연스럽게 얹기 위함.
  - 스케일 기준: 좌우 바퀴 바깥면 사이 거리 = 120mm (엔진의 kit.body.width_mm 과 같은 정의).
"""

import json
import math
import os
import sys

import bpy

# ---- 치수 (mm). 실물 사진 비율을 참고하되, 폭 120mm 기준으로 맞춘다. ----
MM = 0.001
TOTAL_WIDTH_MM = 120.0      # 좌우 바퀴 바깥면 사이 = 엔진이 아는 차폭
WHEEL_THICK_MM = 24.0
WHEEL_DIA_MM = 62.0
HUB_DIA_MM = 34.0
CHASSIS_DIA_MM = 96.0       # 바퀴가 밖으로 돌출하므로 반드시 120보다 작다
CHASSIS_THICK_MM = 3.6

FRAME_PX = 256
ORTHO_MM = 192.0            # 프레임이 담는 실제 크기 → 0.75 mm/px, 120mm = 160px 정확히
SAMPLES = 160

# 56차 — tools/bake/ 로 옮겨 한 칸 깊어졌다. 저장소 뿌리까지 '..' 이 둘이다.
OUT_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..',
                        'assets', 'kits', 'esp32cam-2wd')


def m(mm_value):
    return mm_value * MM


def new_material(name, base_color, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*base_color, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat


def add_tire_bump(mat):
    """타이어 트레드. 탑뷰에서 지그재그 무늬가 살짝 읽히도록 범프만 준다."""
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexWave')
    tex.wave_type = 'BANDS'
    tex.bands_direction = 'Y'
    tex.inputs['Scale'].default_value = 90.0
    tex.inputs['Distortion'].default_value = 6.0
    tex.inputs['Detail'].default_value = 2.0
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    bump.inputs['Distance'].default_value = 0.002
    nt.links.new(tex.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def box(name, size_mm, loc_mm, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (m(size_mm[0]), m(size_mm[1]), m(size_mm[2]))
    obj.location = (m(loc_mm[0]), m(loc_mm[1]), m(loc_mm[2]))
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    return obj


def cyl(name, radius_mm, depth_mm, loc_mm, mat, rot=(0, 0, 0), verts=48):
    bpy.ops.mesh.primitive_cylinder_add(radius=m(radius_mm), depth=m(depth_mm), vertices=verts)
    obj = bpy.context.active_object
    obj.name = name
    obj.location = (m(loc_mm[0]), m(loc_mm[1]), m(loc_mm[2]))
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    return obj


def build_kit():
    """부품 8종. 정밀 복제가 아니라 '탑뷰에서 이 교구로 알아볼 수 있는' 수준."""
    parts = []

    mat_acrylic = new_material('acrylic', (0.018, 0.019, 0.024), roughness=0.13)
    mat_tire = new_material('tire', (0.028, 0.028, 0.032), roughness=0.85)
    add_tire_bump(mat_tire)
    mat_hub = new_material('hub', (0.95, 0.70, 0.04), roughness=0.32)
    mat_battery = new_material('battery', (0.022, 0.022, 0.026), roughness=0.28)
    mat_pcb = new_material('pcb_green', (0.045, 0.28, 0.11), roughness=0.5)
    mat_terminal = new_material('terminal_blue', (0.09, 0.24, 0.72), roughness=0.38)
    mat_metal = new_material('heatsink', (0.72, 0.73, 0.76), roughness=0.28, metallic=1.0)
    mat_board = new_material('board_dark', (0.05, 0.05, 0.07), roughness=0.45)
    mat_gold = new_material('pins', (0.85, 0.66, 0.24), roughness=0.3, metallic=1.0)
    mat_antenna = new_material('antenna', (0.04, 0.04, 0.045), roughness=0.55)
    mat_wire_r = new_material('wire_red', (0.45, 0.04, 0.04), roughness=0.4)
    mat_wire_k = new_material('wire_black', (0.02, 0.02, 0.02), roughness=0.4)
    mat_wire_g = new_material('wire_gray', (0.35, 0.36, 0.38), roughness=0.4)
    mat_caster = new_material('caster', (0.55, 0.56, 0.6), roughness=0.25, metallic=0.9)

    axle_z = WHEEL_DIA_MM / 2.0
    chassis_z = axle_z + 1.0

    # 1) 원형 아크릴 섀시 (반광 검정)
    parts.append(cyl('chassis', CHASSIS_DIA_MM / 2, CHASSIS_THICK_MM,
                     (0, 0, chassis_z), mat_acrylic, verts=64))
    # 섀시 앞쪽 절개 슬롯 (실물에 있는 마운트 홀 느낌)
    parts.append(box('slot_l', (16, 3, CHASSIS_THICK_MM + 1), (26, 12, chassis_z), mat_board))
    parts.append(box('slot_r', (16, 3, CHASSIS_THICK_MM + 1), (26, -12, chassis_z), mat_board))

    # 2) 바퀴 2개 — 폭 기준이 되는 부품
    wheel_center_y = TOTAL_WIDTH_MM / 2 - WHEEL_THICK_MM / 2
    for side, y in (('l', wheel_center_y), ('r', -wheel_center_y)):
        parts.append(cyl(f'tire_{side}', WHEEL_DIA_MM / 2, WHEEL_THICK_MM,
                         (0, y, axle_z), mat_tire, rot=(math.pi / 2, 0, 0), verts=64))
        parts.append(cyl(f'hub_{side}', HUB_DIA_MM / 2, WHEEL_THICK_MM + 1.0,
                         (0, y, axle_z), mat_hub, rot=(math.pi / 2, 0, 0), verts=48))
        # 허브 스포크
        for k in range(5):
            a = k * (2 * math.pi / 5)
            parts.append(box(f'spoke_{side}{k}', (3.5, WHEEL_THICK_MM + 1.2, 13),
                             (math.cos(a) * 10, y, axle_z + math.sin(a) * 10), mat_hub,
                             rot=(0, a, 0)))

    # 3) 전방 볼캐스터
    bpy.ops.mesh.primitive_uv_sphere_add(radius=m(7.5), location=(m(36), 0, m(7.5)))
    ball = bpy.context.active_object
    ball.name = 'caster_ball'
    ball.data.materials.append(mat_caster)
    parts.append(ball)
    parts.append(box('caster_mount', (16, 16, 14), (36, 0, chassis_z - 8), mat_board))

    # 4) 상단 배터리팩 (뒤쪽)
    parts.append(box('battery', (52, 40, 20), (-20, 0, chassis_z + 12), mat_battery))
    parts.append(box('battery_lid', (26, 15, 1.2), (-26, 0, chassis_z + 22.1), mat_battery))

    # 5) L298N 모터드라이버 (초록 기판 + 파랑 단자 + 방열판)
    parts.append(box('l298n_pcb', (42, 42, 1.6), (6, 0, chassis_z + 4), mat_pcb))
    parts.append(box('l298n_heatsink', (12, 26, 13), (2, 0, chassis_z + 11), mat_metal))
    parts.append(box('l298n_term_a', (10, 34, 11), (22, 0, chassis_z + 10), mat_terminal))
    parts.append(box('l298n_term_b', (10, 22, 11), (-10, 4, chassis_z + 10), mat_terminal))

    # 6) 컨트롤 보드 + 핀헤더 (앞쪽)
    parts.append(box('ctrl_pcb', (40, 25, 1.6), (25, 7, chassis_z + 4), mat_board))
    parts.append(box('ctrl_module', (17, 13, 3.2), (27, 7, chassis_z + 6.4), mat_metal))
    for sgn in (1, -1):
        parts.append(box(f'ctrl_pins_{sgn}', (38, 2.4, 3), (25, 7 + sgn * 11.0, chassis_z + 6), mat_gold))

    # 7) 안테나 — 뒤쪽으로 30도 눕힘 (탑뷰에서도 보이도록)
    tilt = math.radians(30)
    a_len, a_r = 56.0, 3.0
    base = (14, 14, chassis_z + 6)
    cx = base[0] - math.sin(tilt) * a_len / 2
    cz = base[2] + math.cos(tilt) * a_len / 2
    parts.append(cyl('antenna', a_r, a_len, (cx, base[1], cz), mat_antenna,
                     rot=(0, -tilt, 0), verts=16))
    parts.append(cyl('antenna_base', 4.5, 6, (base[0], base[1], base[2]), mat_antenna, verts=16))

    # 8) 배선 몇 가닥
    wires = [
        ((-4, 20, chassis_z + 7), (24, 26, chassis_z + 5), mat_wire_g, 2.0),
        ((-14, -18, chassis_z + 7), (18, -22, chassis_z + 5), mat_wire_r, 1.6),
        ((-16, -22, chassis_z + 7), (16, -26, chassis_z + 5), mat_wire_k, 1.6),
    ]
    for i, (p0, p1, mat, r) in enumerate(wires):
        curve = bpy.data.curves.new(f'wire{i}', 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = m(r)
        curve.bevel_resolution = 3
        spline = curve.splines.new('BEZIER')
        spline.bezier_points.add(2)
        mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + 8, max(p0[2], p1[2]) + 6)
        for bp, pt in zip(spline.bezier_points, (p0, mid, p1)):
            bp.co = (m(pt[0]), m(pt[1]), m(pt[2]))
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
        obj = bpy.data.objects.new(f'wire{i}', curve)
        obj.data.materials.append(mat)
        bpy.context.scene.collection.objects.link(obj)
        parts.append(obj)

    # 전체를 하나의 부모 empty 에 묶어 회전은 이 empty 만 돌린다.
    bpy.ops.object.empty_add(location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = 'kit_root'
    for p in parts:
        p.parent = root
    return root, parts


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.resolution_x = FRAME_PX
    scene.render.resolution_y = FRAME_PX
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'  # 색이 튀지 않게
    scene.view_settings.exposure = float(os.environ.get('EXPOSURE', '0.0'))

    # 월드 앰비언트
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.45, 0.5, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = float(os.environ.get('WORLD_STRENGTH', '0.35'))
    scene.world = world

    # 정투영 수직 탑뷰. 월드 고정.
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = m(ORTHO_MM)
    cam = bpy.data.objects.new('cam', cam_data)
    cam.location = (0, 0, m(400))
    cam.rotation_euler = (0, 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam

    # 광원도 월드 고정 (차량만 회전시킨다).
    # 태양광(평행광)을 쓰면 프레임마다 그림자 방향과 길이가 정확히 같아 스프라이트가 일관된다.
    from mathutils import Vector
    key_data = bpy.data.lights.new('key', type='SUN')
    key_data.energy = float(os.environ.get('KEY_ENERGY', '2.6'))
    key_data.angle = math.radians(7)          # 살짝만 부드러운 그림자 가장자리
    key = bpy.data.objects.new('key', key_data)
    key.location = (0, 0, m(300))
    key.rotation_euler = Vector((0.34, -0.42, -0.84)).normalized().to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(key)

    fill_data = bpy.data.lights.new('fill', type='SUN')
    fill_data.energy = float(os.environ.get('FILL_ENERGY', '0.8'))
    fill_data.angle = math.radians(45)
    fill = bpy.data.objects.new('fill', fill_data)
    fill.location = (0, 0, m(300))
    fill.rotation_euler = Vector((-0.4, 0.3, -0.87)).normalized().to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(fill)

    # 그림자 받이 평면 (그림자 시트 전용)
    bpy.ops.mesh.primitive_plane_add(size=m(400), location=(0, 0, 0))
    catcher = bpy.context.active_object
    catcher.name = 'shadow_catcher'
    catcher.is_shadow_catcher = True
    catcher.hide_render = True
    return scene, catcher


def render_frames(scene, root, parts, catcher):
    body_dir = os.path.join(OUT_ROOT, 'topview')
    shadow_dir = os.path.join(OUT_ROOT, 'shadow')
    os.makedirs(body_dir, exist_ok=True)
    os.makedirs(shadow_dir, exist_ok=True)

    frames = []
    for i in range(16):
        deg = i * 22.5
        name = f'{int(math.floor(deg)):03d}'
        root.rotation_euler = (0, 0, math.radians(deg))

        # 본체 시트
        catcher.hide_render = True
        for p in parts:
            p.visible_camera = True
        scene.render.filepath = os.path.join(body_dir, name + '.png')
        bpy.ops.render.render(write_still=True)

        # 그림자 시트 — 본체는 카메라에서 숨기고 그림자만 남긴다
        catcher.hide_render = False
        for p in parts:
            p.visible_camera = False
        scene.render.filepath = os.path.join(shadow_dir, name + '.png')
        bpy.ops.render.render(write_still=True)

        frames.append({'index': i, 'angle_deg': deg, 'file': name + '.png'})
        print(f'  frame {name} ({deg}도) 완료', flush=True)

    return frames


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene, catcher = setup_scene()
    root, parts = build_kit()
    frames = render_frames(scene, root, parts, catcher)

    mm_per_px = ORTHO_MM / FRAME_PX
    meta = {
        'kit_id': 'esp32cam-2wd',
        'generated_by': 'render_kit_topview.py',
        'projection': 'orthographic_top',
        'frame_px': FRAME_PX,
        'mm_per_px': mm_per_px,
        'px_per_mm': 1.0 / mm_per_px,
        'pivot_px': [FRAME_PX / 2, FRAME_PX / 2],
        'heading_zero': '+x (화면 오른쪽)',
        'rotation_dir': 'ccw',
        'step_deg': 22.5,
        'width_definition': '좌우 바퀴 바깥면 사이 거리',
        'width_mm': TOTAL_WIDTH_MM,
        'chassis_diameter_mm': CHASSIS_DIA_MM,
        'wheel': {'diameter_mm': WHEEL_DIA_MM, 'thickness_mm': WHEEL_THICK_MM},
        'frames': frames,
        'body_dir': 'topview',
        'shadow_dir': 'shadow',
    }
    with open(os.path.join(OUT_ROOT, 'topview.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print('topview.json 기록 완료')


if __name__ == '__main__':
    main()
