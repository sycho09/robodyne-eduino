"""
tools/bake/render_iso_scene.py — 아이소메트릭 트랙 배경 + 같은 카메라의 차량 16방향 스프라이트.

빌드 단계 스크립트다. 결과 PNG/JSON 만 커밋하며 앱 실행에 Blender 는 필요 없다.
    python3 -m pip install bpy pillow numpy
    python3 tools/bake/render_iso_scene.py

카메라
  코너 방향 방위각 45도, 표준 아이소 고도 35.264도, 정투영. 고정이므로 배경은 한 장이면 된다.

입체감
  해상도가 아니라 두께와 그림자에서 나온다. 그래서 층을 실제로 쌓는다.
    바닥판(20mm) → 바깥 테이프(2mm) → 주행 대역(1mm) → 안쪽 테이프(2mm) → 안쪽 단차(10mm)
  각 층은 아래 층의 안쪽을 덮는다. 그래서 불리언 없이도 링 모양이 나온다.
  안쪽 단차는 차량 높이(60mm)보다 훨씬 낮아 차량을 가릴 수 없다(가림 처리 불필요).

투영 좌표
  화면 좌표 변환을 코드가 짐작하지 않도록, Blender 가 실제로 계산한 축 벡터를 사이드카 JSON 에 적는다.
  렌더러는 그 값만 읽어 물리 좌표(mm)를 픽셀로 옮긴다.
"""

import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# 56차 — 봉인은 tools/seal/ 로 갈라져 나갔다. 굽기가 끝에서 봉인을 부르므로 그 폴더도 함께 연다.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'seal'))
import seal_assets   # noqa: E402  (bpy 초기화 뒤에 붙인 경로라 여기서 부른다)

MM = 0.001
# 56차 — tools/bake/ 로 옮겨 한 칸 깊어졌다. 저장소 뿌리까지 '..' 이 둘이다.
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
CHALLENGE = os.path.join(ROOT, 'src', 'challenges', 'esp32cam-2wd', 'square-basic.json')
KIT = os.path.join(ROOT, 'src', 'kits', 'esp32cam-2wd.json')
FLOOR_TEX = os.path.join(ROOT, 'assets', 'tracks', 'classroom', 'floor.png')
TEX_DIR = os.path.join(ROOT, 'assets', 'tracks', 'classroom')

# 계열마다 다른 공간으로 읽히도록 바닥 질감을 가른다(50차).
# 어떤 테마인지는 매니페스트(scene.theme)가 정한다 — 이 파일은 챌린지 이름을 모른다.
# 밝기 곱(주행 대역 1.0 / 코스 밖 0.30 / 안쪽 0.50)은 테마와 무관하게 같으므로
# 어느 바닥을 깔아도 노면과 코스 밖의 밝기 비는 달라지지 않는다.
THEMES = {
    'classroom': {'floor': 'floor.png', 'outside': 0.30, 'infield': 0.50},
    'race': {'floor': 'floor-carpet.png', 'outside': 0.30, 'infield': 0.50},
    'warehouse': {'floor': 'floor-concrete.png', 'outside': 0.34, 'infield': 0.52},
    # 도시는 스마트시티(44차)와 같은 읽힘으로 둔다 — 바깥이 어둡고 노면만 밝다.
    'city': {'floor': 'floor.png', 'outside': 0.15, 'infield': 0.24},
}

# 소품 색. 종류마다 기본색이 있고, 매니페스트가 tone 을 적으면 그것이 이긴다.
# 51차 — 어떤 소품도 노면보다 밝지 않아야 한다. 밝은 소품 하나가 있으면 시선이 코스보다
# 그쪽으로 먼저 간다(배포본의 흰 보드 펜스가 그랬다). 평균만 보는 조건은 어두운 바닥이
# 평균을 끌어내려 그 상태로도 통과한다 — tools/checks/brightness.py 가 최대값도 함께 본다.
# 소품이 테마를 알려주는 일은 형태가 한다. 펜스는 흰색이 아니어도 펜스로 읽힌다.
TONES = {
    # 세워 둔 판은 바닥보다 빛을 더 받는다 — 바닥과 같은 반사율로는 노면보다 밝게 나온다.
    # 51차 실측: 반사율 0.45 인 보드 펜스가 0.709 로 구워져 노면(0.66)을 넘었다.
    'white': (0.36, 0.37, 0.39),
    'offwhite': (0.50, 0.50, 0.49),
    'red': (0.55, 0.11, 0.12),
    # 53차 — 밝기는 통과하는데 화면에서 코스보다 먼저 눈에 띄었다(실측 채도 파랑 75% · 노랑 89%).
    # 색을 지우지 않고 채도만 내린다 — 형태는 그대로라 파랑 선반은 여전히 선반으로 읽힌다.
    # 밝기(휘도)는 거의 그대로 두어 밝기 비 조건이 흔들리지 않게 한다.
    'blue': (0.19, 0.23, 0.27),
    'yellow': (0.40, 0.34, 0.28),
    'green': (0.11, 0.34, 0.18),
    'orange': (0.72, 0.28, 0.05),
    'dark': (0.09, 0.10, 0.12),
    'steel': (0.42, 0.44, 0.48),
    'wood': (0.34, 0.26, 0.19),
    'leaf': (0.16, 0.36, 0.20),
    'plastic': (0.22, 0.25, 0.30),
    # 인도. 밝게 칠하면 노면과 한 덩어리로 보여 "노면이 코스 밖보다 1.5배 밝다" 는 규칙이 깨진다.
    'walk': (0.14, 0.15, 0.17),
}
CHALLENGE_INDEX = os.path.join(ROOT, 'src', 'challenges', 'index.json')
ASSET_MANIFEST = os.path.join(ROOT, 'assets', 'assets.manifest.json')
OUT_TRACK = os.path.join(ROOT, 'assets', 'tracks', 'classroom')
OUT_KIT = os.path.join(ROOT, 'assets', 'kits', 'esp32cam-2wd')

AZIMUTH_DEG = 225.0
ELEVATION_DEG = math.degrees(math.atan(1 / math.sqrt(2)))   # 35.264 — 표준 아이소
MARGIN = 0.12
# 배경 해상도. 화면이 픽셀 밀도만큼 그리므로 배경도 그만큼 커야 흐려지지 않는다.
# 50차: 계열 테마가 붙으면서 씬마다 프레임 폭이 달라졌다. 폭을 고정하면 넓은 씬만 흐려진다.
# 그래서 1mm 당 픽셀 수를 고정하고 픽셀 수를 씬 폭에서 계산한다 —
# 어느 배경이든 노면 1mm 가 같은 픽셀 수를 갖는다.
BG_PX = (4096, 2800)          # 기준값(가로:세로 비와 스마트시티 등 옛 경로가 그대로 쓴다)
BG_PX_PER_MM = 4096 / 3983.0  # 49차까지 구운 배경과 같은 밀도
BG_PX_MAX = 5600              # 굽는 시간이 픽셀 수에 비례한다. 위쪽은 막아 둔다.


# 도시 배경의 가로 픽셀 상한. 추적 뷰가 확대하는 배율(7666 / 3400 = 2.25배)을 감당하고도 남는다.
CITY_BG_PX_MAX = 3200


def bg_resolution(ortho_mm):
    w = int(round(min(BG_PX_MAX, ortho_mm * BG_PX_PER_MM)))
    w -= w % 2
    return (w, int(round(w * BG_PX[1] / BG_PX[0])) // 2 * 2)
# 45차: RC카가 화면에서 커지면서 256px 프레임의 계단이 보였다. 프레임을 키우고 방향을 늘린다.
# 방향이 16개면 22.5도마다 그림이 툭 튄다 — 32개(11.25도)면 회전이 이어져 보인다.
SPRITE_PX = 384
SPRITE_DIRS = 32
SPRITE_ORTHO_MM = 320.0
SAMPLES_BG = 200
SAMPLES_SPRITE = 160

# 층 높이 (mm). 대역 윗면이 차량이 서는 높이다.
# 안쪽 슬래브는 바깥 슬래브 위에 겹쳐 놓이므로 높이가 안쪽으로 갈수록 커야 보인다.
# 예전 값(인필드 28mm)은 무대처럼 솟아 보였다 — 단차를 1mm 안쪽으로 줄여 노면과 거의 평평하게 만든다.
BASE_TOP, TAPE_OUT_TOP, BAND_TOP, TAPE_IN_TOP, INFIELD_TOP = 0.0, 2.0, 3.0, 3.6, 4.0
TAPE_W = 19.0


def m(v):
    return v * MM


def mat(name, color, roughness=0.6, metallic=0.0, emission=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    b = material.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = roughness
    b.inputs['Metallic'].default_value = metallic
    # 켜진 신호등처럼 스스로 빛나야 하는 것. 조명이 어디서 오든 색이 유지된다.
    if emission > 0:
        b.inputs['Emission Color'].default_value = (*color, 1)
        b.inputs['Emission Strength'].default_value = emission
    return material


def floor_material(name, brightness, tex_file='floor.png'):
    material = mat(name, (0.5, 0.5, 0.5), roughness=0.55)
    nt = material.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(os.path.join(TEX_DIR, tex_file))
    tex.extension = 'REPEAT'
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (1 / m(600), 1 / m(600), 1)   # 텍스처 한 장 = 600mm
    nt.links.new(geo.outputs['Position'], mapping.inputs['Vector'])
    nt.links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
    dim = nt.nodes.new('ShaderNodeMixRGB')
    dim.blend_type = 'MULTIPLY'
    dim.inputs['Fac'].default_value = 1.0
    dim.inputs['Color2'].default_value = (brightness, brightness, brightness, 1)
    nt.links.new(tex.outputs['Color'], dim.inputs['Color1'])
    nt.links.new(dim.outputs['Color'], bsdf.inputs['Base Color'])
    return material


def slot_path(slot_ref):
    """'slot:x.y' → 실제 파일 경로. 경로는 assets.manifest.json 만 소유한다."""
    slots = json.load(open(ASSET_MANIFEST, encoding='utf-8'))['slots']
    entry = slots[slot_ref.replace('slot:', '')]
    return os.path.normpath(os.path.join(ROOT, 'assets', entry['path']))


_MARKER_MATS = {}


def marker_material(tex_path):
    """마커 색은 등록된 에셋에서 그대로 가져온다. 코드에서 색을 지어내지 않는다."""
    if tex_path in _MARKER_MATS:
        return _MARKER_MATS[tex_path]
    material = mat('marker_' + os.path.basename(tex_path), (0.5, 0.5, 0.5), roughness=0.5)
    nt = material.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(tex_path)
    tex.extension = 'CLIP'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    _MARKER_MATS[tex_path] = material
    return material


# 표지판 치수 (mm). 카메라가 앞을 보므로 표적도 서 있어야 개념이 맞는다.
SIGN_BASE_R, SIGN_BASE_H, SIGN_POST_W, SIGN_POST_H = 46.0, 8.0, 22.0, 46.0


def place_markers(markers, z_top):
    """매니페스트 좌표 그대로 세운 표지판. 판 지름은 매니페스트의 size_mm 과 같다.

    배경은 카메라가 고정된 프리렌더다. 판을 좌표마다 다른 방향으로 돌리면 어떤 표지판은
    옆면만 보여 크기 비교가 안 된다. 그래서 네 개 모두 카메라 정면을 향하게 세운다.
    """
    for mk in markers:
        material = marker_material(slot_path(mk['asset']))
        x, y, size = m(mk['x']), m(mk['y']), m(mk['size_mm'])
        z0 = m(z_top)
        facing = math.radians(AZIMUTH_DEG)

        bpy.ops.mesh.primitive_cylinder_add(radius=m(SIGN_BASE_R), depth=m(SIGN_BASE_H),
                                            location=(x, y, z0 + m(SIGN_BASE_H) / 2))
        base = bpy.context.active_object
        base.name = 'sign_base_' + mk['id']
        base.data.materials.append(material)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(x, y, z0 + m(SIGN_BASE_H + SIGN_POST_H / 2)))
        post = bpy.context.active_object
        post.name = 'sign_post_' + mk['id']
        post.scale = (m(SIGN_POST_W), m(SIGN_POST_W), m(SIGN_POST_H))
        post.data.materials.append(material)

        plate_z = z0 + m(SIGN_BASE_H + SIGN_POST_H) + size / 2
        bpy.ops.mesh.primitive_plane_add(size=size, location=(x, y, plate_z))
        plate = bpy.context.active_object
        plate.name = 'sign_plate_' + mk['id']
        plate.rotation_euler = (math.pi / 2, 0.0, facing + math.pi / 2)
        plate.data.materials.append(material)


def slab(name, half_mm, corner_r_mm, z_from, z_to, material):
    """윗면이 z_to 인 판. 모서리 반지름은 외곽선을 직접 만들어 준다.

    베벨 모디파이어는 수평 모서리까지 깎아 얇은 판에서는 의도대로 나오지 않는다.
    그래서 윗면 폴리곤을 직접 만들고 솔리디파이로 두께만 준다.
    """
    import bmesh
    pts = []
    r = min(corner_r_mm, half_mm)
    if r <= 0:
        pts = [(-half_mm, -half_mm), (half_mm, -half_mm), (half_mm, half_mm), (-half_mm, half_mm)]
    else:
        flat = half_mm - r
        segs = 12
        for cx, cy, a0 in ((flat, flat, 0.0), (-flat, flat, 90.0), (-flat, -flat, 180.0), (flat, -flat, 270.0)):
            for k in range(segs + 1):
                a = math.radians(a0 + 90.0 * k / segs)
                pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(m(x), m(y), m(z_to)) for x, y in pts], [], [list(range(len(pts)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    thickness = z_to - z_from
    if thickness > 0:
        sol = obj.modifiers.new('solid', 'SOLIDIFY')
        sol.thickness = m(thickness)
        sol.offset = -1.0       # 아래로만 두껍게 (윗면 높이를 z_to 로 유지)
    obj.data.materials.append(material)
    return obj


def setup_camera(scene, ortho_mm, target_z_mm, res):
    scene.render.resolution_x, scene.render.resolution_y = res
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = m(ortho_mm)
    cam = bpy.data.objects.new('cam', cam_data)
    az, el = math.radians(AZIMUTH_DEG), math.radians(ELEVATION_DEG)
    direction = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    cam.location = direction * m(6000) + Vector((0, 0, m(target_z_mm)))
    cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def lighting(scene, key_energy=3.0):
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.46, 0.52, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.5
    scene.world = world
    for name, energy, vec, angle in (
        ('key', key_energy, (0.62, -0.48, -0.62), 2.0),   # 낮게 깔아 단차 그림자가 보이게
        ('fill', 0.9, (-0.5, 0.35, -0.79), 40.0),
    ):
        data = bpy.data.lights.new(name, type='SUN')
        data.energy = energy
        data.angle = math.radians(angle)
        obj = bpy.data.objects.new(name, data)
        obj.rotation_euler = Vector(vec).normalized().to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(obj)


def base_scene(res, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # 씬을 새로 열면 앞 씬의 머티리얼은 사라진다. 캐시가 남아 있으면 죽은 참조를 붙이게 된다.
    _MARKER_MATS.clear()
    _TONE_MATS.clear()
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x, scene.render.resolution_y = res
    return scene


def projection_axes(scene, cam, res):
    """Blender 가 계산한 실제 화면 위치로 축 벡터를 뽑는다. 렌더러는 이 값만 믿는다."""
    def px(p):
        v = world_to_camera_view(scene, cam, Vector(p))
        return [v.x * res[0], (1 - v.y) * res[1]]

    o = px((0, 0, 0))
    ax = px((m(1000), 0, 0))
    ay = px((0, m(1000), 0))
    az = px((0, 0, m(1000)))
    per_mm = lambda p: [(p[0] - o[0]) / 1000.0, (p[1] - o[1]) / 1000.0]
    return {'origin_px': o, 'x_axis_px': per_mm(ax), 'y_axis_px': per_mm(ay), 'z_axis_px': per_mm(az)}


def band_strip(name, points, half_w_mm, z_mm, material, step_mm=0.25):
    """폴리라인 중심선을 따라 깔리는 대역. 구간마다 사각 판 한 장이고,
    끝을 half_w 만큼 늘려 직각 모서리가 저절로 메워진다.

    모서리와 교차부에서는 판이 겹친다. 같은 높이로 두면 완전히 동일 평면이라
    광선 교차가 갈리지 않아 검게 뭉개진다 — 구간마다 0.25mm 씩 띄워 둔다(눈에는 안 보인다).
    """
    n = len(points)
    for i in range(n):
        ax, ay = points[i]
        bx, by = points[(i + 1) % n]
        length = math.hypot(bx - ax, by - ay) + 2 * half_w_mm
        horizontal = abs(by - ay) < 1e-9
        sx = length if horizontal else 2 * half_w_mm
        sy = 2 * half_w_mm if horizontal else length
        bpy.ops.mesh.primitive_plane_add(size=1.0, location=(m((ax + bx) / 2), m((ay + by) / 2), m(z_mm + i * step_mm)))
        obj = bpy.context.active_object
        obj.name = f'{name}_{i}'
        obj.scale = (m(sx), m(sy), 1.0)
        obj.data.materials.append(material)


_TONE_MATS = {}


def tone_material(tone, roughness=0.6, metallic=0.0):
    """소품 색은 TONES 표에서만 나온다. 매니페스트는 이름(tone)만 적는다."""
    key = (tone, roughness, metallic)
    if key not in _TONE_MATS:
        _TONE_MATS[key] = mat(f'tone_{tone}_{len(_TONE_MATS)}', TONES[tone],
                              roughness=roughness, metallic=metallic)
    return _TONE_MATS[key]


def place_props(props):
    """
    코스 밖 소품. 종류·자리·크기·색은 전부 매니페스트가 정한다.
    배경일 뿐이라 판정·물리와는 아무 상관이 없다 — 이 파일은 몇 개가 어디에 오는지 모른다.

    50차에서 종류를 늘렸다. 계열마다 다른 공간(레이스장·물류창고)으로 읽혀야 해서다.
    옛 종류(desk·stool·plant·box)는 그대로 둔다 — 지우면 그 종류를 쓰던 매니페스트가 깨진다.
    """
    if not props:
        return
    for i, p in enumerate(props):
        kind = p.get('kind', 'box')
        x, y = p['x'], p['y']
        w = p.get('w', 300)
        d = p.get('d', 300)
        h = p.get('h', 200)
        tone = p.get('tone')
        wood = tone_material('wood', roughness=0.75)
        metal = tone_material('steel', roughness=0.35, metallic=0.7)
        plastic = tone_material('plastic', roughness=0.6)

        if kind == 'desk':
            for k, (dx, dy) in enumerate(((-w / 2 + 30, -d / 2 + 30), (w / 2 - 30, -d / 2 + 30),
                                          (-w / 2 + 30, d / 2 - 30), (w / 2 - 30, d / 2 - 30))):
                box(f'prop{i}_leg{k}', x + dx, y + dy, 26, 26, BASE_TOP, BASE_TOP + h - 24, metal)
            box(f'prop{i}_top', x, y, w, d, BASE_TOP + h - 24, BASE_TOP + h, wood)
        elif kind == 'stool':
            box(f'prop{i}_leg', x, y, 44, 44, BASE_TOP, BASE_TOP + h - 20, metal)
            box(f'prop{i}_seat', x, y, w, d, BASE_TOP + h - 20, BASE_TOP + h, plastic)
        elif kind == 'plant':
            box(f'prop{i}_pot', x, y, w * 0.6, d * 0.6, BASE_TOP, BASE_TOP + h * 0.35,
                tone_material('wood', roughness=0.9))
            cone(f'prop{i}_leaf', x, y, w * 0.55, BASE_TOP + h * 0.35, BASE_TOP + h,
                 tone_material('leaf', roughness=0.85))

        # ── 레이스장 ─────────────────────────────────────────────
        elif kind == 'fence':
            # 코스 경계를 닫는 낮은 보드 펜스. 광고판처럼 판이 서고 뒤를 기둥이 받친다.
            board = tone_material(tone or 'white', roughness=0.45)
            long_x = w >= d
            thin = min(w, d)
            box(f'prop{i}_board', x, y, w, d, BASE_TOP + h * 0.22, BASE_TOP + h, board)
            span = (w if long_x else d)
            # 기둥은 판보다 두꺼워야 판 앞뒤로 삐져나와 기둥으로 읽힌다.
            for k, t in enumerate((-0.42, 0.0, 0.42)):
                px = x + (span * t if long_x else 0.0)
                py = y + (0.0 if long_x else span * t)
                sx = 70.0 if long_x else thin * 2.0
                sy = thin * 2.0 if long_x else 70.0
                box(f'prop{i}_post{k}', px, py, sx, sy, BASE_TOP, BASE_TOP + h * 0.92, metal)
        elif kind == 'cone':
            # 러버콘. 밑판 + 원뿔 + 반사 띠.
            base_h = h * 0.06
            box(f'prop{i}_base', x, y, w, d, BASE_TOP, BASE_TOP + base_h,
                tone_material(tone or 'orange', roughness=0.7))
            cone(f'prop{i}_body', x, y, w * 0.42, BASE_TOP + base_h, BASE_TOP + h,
                 tone_material(tone or 'orange', roughness=0.7))
            box(f'prop{i}_band', x, y, w * 0.56, d * 0.56, BASE_TOP + h * 0.48, BASE_TOP + h * 0.62,
                tone_material('white', roughness=0.5))
        elif kind == 'tires':
            # 타이어 배리어. 짧은 원기둥을 긴 쪽으로 늘어놓는다.
            long_x = w >= d
            span = max(w, d)
            r = min(w, d) / 2
            n = max(2, int(round(span / (2 * r))))
            rubber = tone_material(tone or 'dark', roughness=0.85)
            for k in range(n):
                t = (k + 0.5) / n - 0.5
                px = x + (span * t if long_x else 0.0)
                py = y + (0.0 if long_x else span * t)
                cyl(f'prop{i}_tire{k}', px, py, r * 0.94, BASE_TOP, BASE_TOP + h, rubber)

        # ── 물류창고 ─────────────────────────────────────────────
        elif kind == 'rack':
            # 팔레트 랙. 기둥 넷에 빔 두 단, 위 칸에 상자를 얹는다.
            frame = tone_material(tone or 'blue', roughness=0.45)
            post_t = 70.0
            for k, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
                box(f'prop{i}_up{k}', x + sx * (w / 2 - post_t / 2), y + sy * (d / 2 - post_t / 2),
                    post_t, post_t, BASE_TOP, BASE_TOP + h, frame)
            for k, level in enumerate((0.46, 0.98)):
                box(f'prop{i}_beam{k}', x, y, w, d, BASE_TOP + h * level - 40, BASE_TOP + h * level, frame)
            for k, t in enumerate((-0.26, 0.26)):
                box(f'prop{i}_load{k}', x + w * t, y, w * 0.4, d * 0.78,
                    BASE_TOP + h * 0.46, BASE_TOP + h * 0.82, tone_material('wood', roughness=0.8))
        elif kind == 'pallet':
            # 팔레트. 받침 셋 위에 널 넉 장.
            slat = tone_material(tone or 'wood', roughness=0.85)
            for k, t in enumerate((-0.4, 0.0, 0.4)):
                box(f'prop{i}_foot{k}', x, y + d * t, w, d * 0.14, BASE_TOP, BASE_TOP + h * 0.6, slat)
            for k, t in enumerate((-0.42, -0.14, 0.14, 0.42)):
                box(f'prop{i}_slat{k}', x + w * t, y, w * 0.18, d, BASE_TOP + h * 0.6, BASE_TOP + h, slat)
        elif kind == 'forklift':
            # 지게차. 몸체 + 마스트 + 포크 둘. 코스 밖에만 둔다.
            body = tone_material(tone or 'yellow', roughness=0.4)
            box(f'prop{i}_body', x, y, w, d * 0.62, BASE_TOP + h * 0.12, BASE_TOP + h * 0.55, body)
            box(f'prop{i}_cab', x, y - d * 0.08, w * 0.7, d * 0.34, BASE_TOP + h * 0.55, BASE_TOP + h, body)
            box(f'prop{i}_mast', x, y + d * 0.40, w * 0.74, 60, BASE_TOP, BASE_TOP + h * 0.92,
                tone_material('steel', roughness=0.4, metallic=0.6))
            for k, t in enumerate((-0.24, 0.24)):
                box(f'prop{i}_fork{k}', x + w * t, y + d * 0.56, 60, d * 0.30, BASE_TOP, BASE_TOP + 40,
                    tone_material('steel', roughness=0.4, metallic=0.6))
            for k, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
                cyl(f'prop{i}_wheel{k}', x + sx * w * 0.36, y + sy * d * 0.22, h * 0.13,
                    BASE_TOP, BASE_TOP + h * 0.26, tone_material('dark', roughness=0.9))
        elif kind == 'crate':
            box(f'prop{i}_crate', x, y, w, d, BASE_TOP, BASE_TOP + h,
                tone_material(tone or 'wood', roughness=0.8))
        elif kind == 'paint':
            # 바닥 페인트. 아주 얇은 판이라 그림자를 만들지 않는다.
            # 노면이 아니라 코스 밖 바닥에만 칠한다 — 판정과는 아무 상관이 없다.
            box(f'prop{i}_paint', x, y, w, d, BASE_TOP, BASE_TOP + 0.4,
                tone_material(tone or 'yellow', roughness=0.55))

        else:
            box(f'prop{i}_box', x, y, w, d, BASE_TOP, BASE_TOP + h,
                tone_material(tone or 'plastic', roughness=0.6))


CHECKER_CELL = 90.0     # 체커 한 칸 (mm)
CHECKER_ROWS = 2        # 진행 방향으로 두 줄


def place_finish_checker(scene_def, half_w_mm, z_mm):
    """출발선 체커 플래그. 노면 위에 깔리는 얇은 판이라 물리·판정과는 무관하다.

    색은 흰색과 진회색으로 둔다. 검정을 깔면 노면 표본이 어두워져
    '노면이 코스 밖보다 1.5배 밝다' 는 규칙이 출발선 부근에서만 깨진다.
    """
    lap = scene_def.get('lap') or {}
    finish_id = lap.get('finish')
    cp = next((c for c in scene_def.get('checkpoints') or [] if c['id'] == finish_id), None)
    if not cp:
        return
    ang = math.radians(cp.get('normal_deg', 0))
    fx, fy = math.cos(ang), math.sin(ang)          # 진행 방향
    ax, ay = -fy, fx                               # 선을 가로지르는 방향
    # 흰 칸도 노면보다 어두워야 한다. TONES['white'] 를 그대로 쓰므로 함께 내려간다.
    light = mat('checker_light', TONES['white'], roughness=0.5)
    dark = mat('checker_dark', (0.20, 0.21, 0.23), roughness=0.5)
    cols = max(2, int(round(2 * half_w_mm / CHECKER_CELL)))
    for r in range(CHECKER_ROWS):
        for c in range(cols):
            u = (c + 0.5) / cols * (2 * half_w_mm) - half_w_mm
            v = (r + 0.5 - CHECKER_ROWS / 2) * CHECKER_CELL
            cx = cp['x'] + ax * u + fx * v
            cy = cp['y'] + ay * u + fy * v
            cell = light if (r + c) % 2 == 0 else dark
            bpy.ops.mesh.primitive_plane_add(
                size=1.0, location=(m(cx), m(cy), m(z_mm + 0.3 + 0.02 * (r * cols + c))))
            obj = bpy.context.active_object
            obj.name = f'checker_{r}_{c}'
            obj.scale = (m(2 * half_w_mm / cols), m(CHECKER_CELL), 1.0)
            # 판의 로컬 x 가 선을 가로지르는 방향(a)이 되도록 90도 더 돌린다.
            obj.rotation_euler = (0.0, 0.0, ang + math.pi / 2)
            obj.data.materials.append(cell)


def render_background(challenge, name):
    track = challenge['scene']['track']
    band = track['width_mm'] / 2
    polyline = track['shape'] == 'polyline'
    if polyline:
        pts = track['points']
        reach = max(max(abs(p[0]), abs(p[1])) for p in pts)
        half = reach
        outer, inner = reach + band, max(0.0, reach - band)
    else:
        half = track['center_side_mm'] / 2
        outer, inner = half + band, half - band

    scene = base_scene(BG_PX, SAMPLES_BG)
    scene.render.film_transparent = False
    lighting(scene)

    # 아이소 화면에서 한 점의 가로 위치는 (x + y) 에 비례한다. 그래서 코스와 소품을
    # 통틀어 |x| + |y| 가 가장 큰 점이 프레임 폭을 정한다.
    # 50차: 소품이 계열 테마가 되면서 코스 밖으로 넓게 퍼졌다. 코스만 재면 소품이 잘린다.
    span = 2 * outer
    for pr in challenge['scene'].get('props') or []:
        span = max(span, abs(pr['x']) + pr.get('w', 300) / 2 + abs(pr['y']) + pr.get('d', 300) / 2)
    projected_half = 0.70710678 * span                # 코너 방향에서 가장 넓게 보이는 폭
    # 추적 뷰(45차)는 카메라가 RC카를 따라 코스 끝까지 움직인다. 그림이 코스만 덮으면
    # 코너에서 화면 가장자리가 빈다 — 보는 창의 절반만큼 더 넓게 구워야 한다.
    chase = challenge['scene'].get('chase') or {}
    ortho = (projected_half + (chase.get('view_width_mm') or 0) / 2) * 2 * (1 + MARGIN)
    res = bg_resolution(ortho)
    cam = setup_camera(scene, ortho, BAND_TOP, res)

    # 테마는 매니페스트가 정한다. 없으면 지금까지의 교실 바닥 그대로다.
    theme = THEMES.get(challenge['scene'].get('theme') or 'classroom', THEMES['classroom'])
    floor_tex = theme['floor']
    dark_floor = floor_material('floor_dark', theme['outside'], floor_tex)
    bright_floor = floor_material('floor_band', 1.0, floor_tex)
    tape = mat('tape', (0.015, 0.015, 0.018), roughness=0.25)
    # 테이프 밑에 한 겹 더 깔아 접지 그림자를 만든다. 두께가 보여야 바닥에 붙은 것으로 읽힌다.
    skirt = mat('tape_skirt', (0.05, 0.05, 0.055), roughness=0.9)
    # 안쪽 면도 같은 바닥 타일이다. 밝기만 낮춰(스크림) 주행 대역이 가장 밝다는 규칙을 지킨다.
    infield = floor_material('floor_infield', theme['infield'], floor_tex)

    # 바닥 판은 화면에 찍히는 범위보다 넉넉해야 한다. 정투영이라 대각선 쪽이 가장 멀리 간다.
    slab('base', ortho, 0, BASE_TOP - 20, BASE_TOP, dark_floor)
    if polyline:
        # 스스로 교차하는 코스에는 '안쪽'이 없다. 대역 판 아래에 조금 더 넓은 테이프 판을 깔아
        # 가장자리에 검은 테를 만든다 — 사각 코스의 테이프 경계와 같은 읽힘을 준다.
        band_strip('tape_skirt', track['points'], band + 8, BASE_TOP + 0.2, skirt)
        band_strip('tape_edge', track['points'], band, BASE_TOP + 1.0, tape)
        band_strip('band', track['points'], band - TAPE_W, BAND_TOP, bright_floor)
    else:
        slab('tape_skirt_o', outer + 8, band - 8, BASE_TOP - 0.6, BASE_TOP + 0.2, skirt)
        slab('tape_outer', outer, band, BASE_TOP, TAPE_OUT_TOP, tape)
        slab('band', outer - TAPE_W, band - TAPE_W, BASE_TOP, BAND_TOP, bright_floor)
        slab('tape_inner', inner + TAPE_W, 0, BASE_TOP, TAPE_IN_TOP, tape)
        slab('infield', inner, 0, BASE_TOP, INFIELD_TOP, infield)

    # 레이스장에는 출발선에 체커 플래그를 깐다. 어느 선이 출발선인지는 매니페스트가 안다
    # (scene.lap.finish 가 가리키는 체크포인트) — 이 파일은 좌표를 짐작하지 않는다.
    if challenge['scene'].get('theme') == 'race':
        # 폴리라인 대역은 구간마다 0.25mm 씩 띄워 깔린다. 체커는 그 맨 윗면보다 위여야 한다.
        band_z = BAND_TOP + (len(track['points']) * 0.25 if polyline else 0.0)
        place_finish_checker(challenge['scene'], band - TAPE_W, band_z)

    # 54차 — 마커를 바닥에 깔지 말지는 매니페스트가 정한다(scene.markers_baked).
    # [색으로 조종하기] 는 웹캠에 비친 물체로 조종한다. 맵 위에 판이 서 있으면
    # 학생이 무엇을 보고 도는지가 헷갈린다. 마커 자리와 색은 매니페스트에 그대로 남는다 —
    # 카메라가 찾을 색을 거기서 읽기 때문이다.
    markers = challenge['scene'].get('markers') or []
    if markers and challenge['scene'].get('markers_baked', True):
        place_markers(markers, BASE_TOP)

    # 코스 밖 소품. 무엇을 어디에 둘지는 매니페스트(scene.props)가 소유한다 —
    # 판정에 전혀 관여하지 않는 배경이고, 이 파일은 개수도 배치도 모른다.
    place_props(challenge['scene'].get('props') or [])

    out_png = os.path.join(OUT_TRACK, name + '.png')
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    # 배경은 알파가 필요 없다. JPEG 로 다시 저장해 용량을 줄인다(스프라이트는 PNG 유지).
    from PIL import Image
    out_jpg = os.path.join(OUT_TRACK, name + '.jpg')
    Image.open(out_png).convert('RGB').save(out_jpg, quality=88, optimize=True, progressive=True)
    os.remove(out_png)

    meta = {
        # 56차 보강1 — 폴더 없이 파일 이름만 적는다. 경로를 적어 두면 스크립트를 옮길 때마다
        # 사이드카 내용이 바뀌어 전부 다시 봉인된다(56차에 한 번 겪었다). 이름만 적으면 어디로 옮겨도 안 틀린다.
        'generated_by': 'render_iso_scene.py',
        'image': name + '.jpg',
        'image_px': list(res),
        'ground_z_mm': BAND_TOP,
        'track': {'shape': track['shape'], 'reach_mm': half, 'width_mm': track['width_mm']},
        'projection': {
            'type': 'isometric_ortho',
            'azimuth_deg': AZIMUTH_DEG,
            'elevation_deg': ELEVATION_DEG,
            'ortho_width_mm': ortho,
            **projection_axes(scene, cam, res),
        },
    }
    with open(os.path.join(OUT_TRACK, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f'배경 {name}.png 완료 (ortho {ortho:.0f}mm)', flush=True)
    return name


# ── 스마트시티 ─────────────────────────────────────────────────
# 폴리곤을 늘리지 않는다. 층 두께와 그림자만으로 깊이를 낸다.
SIDEWALK_W = 180.0     # 도로 양옆 인도 폭 (한쪽)
# 층은 넓은 것부터 아래에, 좁은 것을 그 위에 겹쳐 깐다(전 코스 공통 방식).
# 그래서 인도는 도로보다 낮은 면이 된다 — 아이소 화면에서는 갓길처럼 읽힌다.
WALK_TOP = 1.2
CURB_TOP = 2.2
BUILDING_GAP = 120.0   # 인도 바깥에서 건물까지 띄우는 거리


def box(name, cx_mm, cy_mm, sx_mm, sy_mm, z_from, z_to, material):
    """축에 나란한 상자 하나. 건물·기둥·화단을 전부 이걸로 만든다."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(m(cx_mm), m(cy_mm), m((z_from + z_to) / 2)))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (m(sx_mm), m(sy_mm), m(max(0.1, z_to - z_from)))
    obj.data.materials.append(material)
    return obj


def cyl(name, cx_mm, cy_mm, r_mm, z_from, z_to, material):
    """짧은 원기둥 하나. 타이어·바퀴를 이걸로 만든다."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=m(r_mm), depth=m(max(0.1, z_to - z_from)),
                                        location=(m(cx_mm), m(cy_mm), m((z_from + z_to) / 2)))
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def cone(name, cx_mm, cy_mm, r_mm, z_from, z_to, material):
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=m(r_mm), radius2=0.0,
                                    depth=m(z_to - z_from),
                                    location=(m(cx_mm), m(cy_mm), m((z_from + z_to) / 2)))
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def seg_dir(a, b):
    """구간의 진행 방향과 왼쪽 법선 (단위 벡터, mm 좌표계)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dy) or 1.0
    return (dx / n, dy / n), (-dy / n, dx / n)


def place_crosswalk(cx, cy, along, half_w, z_top, material):
    """진행 방향과 직각으로 흰 띠 여러 장. 판단 지점 위에 깔린다."""
    for k in range(-3, 4):
        ox = along[0] * k * 60.0
        oy = along[1] * k * 60.0
        sx = 34.0 if abs(along[0]) > 0.5 else 2 * half_w
        sy = 2 * half_w if abs(along[0]) > 0.5 else 34.0
        box(f'cw_{int(cx)}_{k}', cx + ox, cy + oy, sx, sy, z_top, z_top + 0.4, material)


def render_city(challenge, name):
    """스마트시티 배경. 도로 폴리라인 + 인도 + 건물 블록 + 횡단보도 + 신호등 + 가로수."""
    track = challenge['scene']['track']
    pts = track['points']
    band = track['width_mm'] / 2
    # 직사각형 코스는 가로·세로 반경이 다르다. 한쪽 값으로 안팎을 잡으면
    # 짧은 변에서 건물이 노면을 덮는다 — 축마다 따로 잰다.
    reach_x = max(abs(p[0]) for p in pts)
    reach_y = max(abs(p[1]) for p in pts)
    reach = max(reach_x, reach_y)
    # 53차 — 바닥판이 좁아 화면 바깥쪽 18% 가 월드 배경(하늘색 0.51)이었다.
    # 하늘은 면이 아니라 빈 곳인데 밝기 검사에는 '코스 밖에서 가장 밝은 곳' 으로 잡혔다.
    # 바닥을 검사 표본 범위(코스 반경 + 1400mm) 밖까지 깔아 빈 곳을 없앤다.
    outer = reach + band + SIDEWALK_W + BUILDING_GAP + 2600

    scene = base_scene(BG_PX, SAMPLES_BG)
    scene.render.film_transparent = False
    lighting(scene)
    projected_half = 0.70710678 * (2 * (reach + band + SIDEWALK_W + 260))
    ortho = projected_half * 2 * (1 + MARGIN)
    # 53차 — 도시는 추적 뷰라 한 번에 3400mm 만 보여 준다(정지 화면은 7666mm 폭을 다 쓰지 않는다).
    # 다른 배경과 같은 밀도로 구우면 5600px 이 되는데, 화면에 필요한 것은 그 절반 남짓이다.
    # 남는 픽셀은 선명함이 아니라 프레임 값으로 나간다 — 실측 fps 46 → 39.
    res = bg_resolution(ortho)
    if res[0] > CITY_BG_PX_MAX:
        res = (CITY_BG_PX_MAX, int(round(CITY_BG_PX_MAX * res[1] / res[0])) // 2 * 2)
    cam = setup_camera(scene, ortho, BAND_TOP, res)

    # 밝기 순서를 지킨다 — 주행 대역이 가장 밝고, 인도·바닥 순으로 어두워진다.
    # 노면과 인도가 한 덩어리 밝은 띠로 보이면 학생이 자기 차가 도로 위인지 알 수 없다.
    # 인도를 확실히 어둡게 내려 노면과 밝기 비를 1.5배 이상으로 벌린다.
    # 53차 D-1 재조정 — 첫 시도에서 코스 밖만 내렸더니 튄 빛이 함께 줄어 노면도 같이 어두워져
    # 비가 1.33 → 1.16 으로 오히려 나빠졌다. 이번에는 바닥을 더 내리고 노면을 함께 올린다.
    ground = mat('ground', (0.044, 0.047, 0.057), roughness=0.9)
    walk = mat('sidewalk', (0.078, 0.082, 0.091), roughness=0.85)
    asphalt = floor_material('asphalt', 1.55)     # 주행 대역이 화면에서 가장 밝다(전 코스 공통 규칙)
    # 연석은 노면과 인도 사이의 어두운 실선이다. 폭이 40mm 뿐이라 띠가 아니라 경계선으로 읽힌다.
    # 밝게 두면 노면보다 밝아져 '주행 대역이 화면에서 가장 밝다'는 전 코스 규칙이 깨진다.
    curb = mat('curb', (0.030, 0.032, 0.036), roughness=0.7)
    white = mat('paint', (0.045, 0.05, 0.055), roughness=0.35)   # 밝은 노면 위의 표시는 어둡게 — 검정 테이프와 같은 읽힘
    pole = mat('pole', (0.20, 0.21, 0.23), roughness=0.4, metallic=0.6)
    head = mat('sig_head_mat', (0.08, 0.09, 0.11), roughness=0.3)
    trunk = mat('trunk', (0.24, 0.17, 0.12), roughness=0.9)
    # 53차 D-1 — 코스 밖 실측에서 노면(0.509)보다 밝은 면이 둘 있었다.
    #   나뭇잎 0.594 · 블록 윗면과 건물 0.565 (표본의 19%가 0.50~0.55 대)
    # 누운 면은 albedo 의 네 배 가까이 밝게 구워진다. 반사율을 절반으로 내려 노면 아래로 보낸다.
    leaf = mat('leaf', (0.048, 0.105, 0.060), roughness=0.85)
    walls = [mat(f'wall{i}', c, roughness=0.75) for i, c in enumerate(
        ((0.130, 0.125, 0.120), (0.095, 0.105, 0.125), (0.115, 0.100, 0.095), (0.080, 0.095, 0.105)))]
    roofs = [mat(f'roof{i}', c, roughness=0.8) for i, c in enumerate(
        ((0.052, 0.052, 0.054), (0.045, 0.049, 0.056)))]
    # 판단 지점 색 — 정지·서행·진행. 신호등 등과 노면 패치에 같은 색을 쓴다.
    zone_mats = {
        'stop': mat('z_stop', (0.62, 0.10, 0.10), roughness=0.5),
        'slow': mat('z_slow', (0.66, 0.44, 0.05), roughness=0.5),
        'go': mat('z_go', (0.10, 0.46, 0.22), roughness=0.5),
        # 신호·상황 지점은 정답이 그때그때 달라진다. 배경에는 색 없는 판만 깔고
        # 실제 색은 화면이 매 프레임 얹는다 — 구운 색이 정답과 어긋나면 안 된다.
        'live': mat('z_live', (0.30, 0.31, 0.34), roughness=0.6),
    }

    slab('ground', outer, 0, BASE_TOP - 20, BASE_TOP, ground)

    # 인도(턱) → 도로 순으로 겹쳐 깔면 불리언 없이 링이 생긴다.
    band_strip('walk', pts, band + SIDEWALK_W, BASE_TOP + WALK_TOP, walk)
    band_strip('curb', pts, band + 40, BASE_TOP + CURB_TOP, curb)
    band_strip('road', pts, band, BAND_TOP, asphalt)

    # 중앙선. 구간마다 짧은 흰 띠를 일정 간격으로 놓는다(위치는 계산으로만 나온다).
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        along, _ = seg_dir(a, b)
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        step = 240.0
        k = step
        while k < length - step / 2:
            cx = a[0] + along[0] * k
            cy = a[1] + along[1] * k
            sx = 120.0 if abs(along[0]) > 0.5 else 24.0
            sy = 24.0 if abs(along[0]) > 0.5 else 120.0
            box(f'lane_{i}_{int(k)}', cx, cy, sx, sy, BAND_TOP + 1.6, BAND_TOP + 2.0, white)
            k += step

    # 가로수. 인도 바깥쪽 가장자리를 따라 일정 간격.
    tree_z = BASE_TOP + WALK_TOP
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        along, left = seg_dir(a, b)
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        k = 260.0
        idx = 0
        while k < length - 200.0:
            for side in (1,):
                nx = left[0] * side * (band + SIDEWALK_W * 0.72)
                ny = left[1] * side * (band + SIDEWALK_W * 0.72)
                cx = a[0] + along[0] * k + nx
                cy = a[1] + along[1] * k + ny
                box(f'tr_{i}_{idx}_{side}', cx, cy, 22, 22, tree_z, tree_z + 150, trunk)
                cone(f'lf_{i}_{idx}_{side}', cx, cy, 80, tree_z + 150, tree_z + 380, leaf)
            k += 700.0
            idx += 1

    # 건물 블록. 도로 안쪽(도심 블록)과 바깥쪽에 단순 상자를 앉힌다.
    inner_x = max(0.0, reach_x - band - SIDEWALK_W - BUILDING_GAP)
    inner_y = max(0.0, reach_y - band - SIDEWALK_W - BUILDING_GAP)
    if min(inner_x, inner_y) > 260:
        box('block_core', 0, 0, inner_x * 2 * 0.78, inner_y * 2 * 0.78, BASE_TOP, BASE_TOP + 240, walls[0])
        box('block_core_top', 0, 0, inner_x * 2 * 0.58, inner_y * 2 * 0.58, BASE_TOP + 240, BASE_TOP + 300, roofs[0])
    edge_x = reach_x + band + SIDEWALK_W + BUILDING_GAP
    edge_y = reach_y + band + SIDEWALK_W + BUILDING_GAP
    heights = (220, 340, 260, 420)
    for i, (sx, sy) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        cx = sx * (edge_x + 220)
        cy = sy * (edge_y + 220)
        h = heights[i % len(heights)]
        box(f'bldg_{i}', cx, cy, 420, 420, BASE_TOP, BASE_TOP + h, walls[(i + 1) % len(walls)])
        box(f'bldg_top_{i}', cx, cy, 330, 330, BASE_TOP + h, BASE_TOP + h + 45, roofs[i % len(roofs)])
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        along, left = seg_dir(a, b)
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        cx = a[0] + along[0] * (length / 2) + left[0] * (band + SIDEWALK_W + BUILDING_GAP + 260)
        cy = a[1] + along[1] * (length / 2) + left[1] * (band + SIDEWALK_W + BUILDING_GAP + 260)
        h = heights[i % len(heights)]
        box(f'side_{i}', cx, cy, 380, 380, BASE_TOP, BASE_TOP + h, walls[i % len(walls)])
        box(f'side_top_{i}', cx, cy, 300, 300, BASE_TOP + h, BASE_TOP + h + 45, roofs[(i + 1) % len(roofs)])

    # 판단 지점 표시. 무엇을 그릴지는 매니페스트가 정한다(marker).
    for d in challenge['scene'].get('decisions') or []:
        best = None
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            along, left = seg_dir(a, b)
            t = ((d['x'] - a[0]) * along[0] + (d['y'] - a[1]) * along[1])
            t = max(0.0, min(math.hypot(b[0] - a[0], b[1] - a[1]), t))
            px, py = a[0] + along[0] * t, a[1] + along[1] * t
            dist = math.hypot(d['x'] - px, d['y'] - py)
            if best is None or dist < best[0]:
                best = (dist, along, left)
        _, along, left = best
        zm = zone_mats.get(d['expect'], zone_mats['live'])
        # 판정 구간을 노면 색으로 표시한다. 어느 구역인지 화면만 보고 알 수 있어야 한다.
        zl = d['zone_mm']
        sx = zl if abs(along[0]) > 0.5 else 2 * band
        sy = 2 * band if abs(along[0]) > 0.5 else zl
        box(f"zone_{d['id']}", d['x'], d['y'], sx, sy, BAND_TOP + 1.0, BAND_TOP + 1.4, zm)
        # 횡단보도 줄무늬는 움직이지 않으니 배경에 굽는다.
        # 신호등 기둥은 굽지 않는다 — 등이 바뀌는 물체라 화면이 스프라이트로 얹는다.
        if d.get('marker') == 'crosswalk':
            place_crosswalk(d['x'], d['y'], along, band, BAND_TOP + 1.8, white)

    out_png = os.path.join(OUT_TRACK, name + '.png')
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    from PIL import Image
    out_jpg = os.path.join(OUT_TRACK, name + '.jpg')
    Image.open(out_png).convert('RGB').save(out_jpg, quality=88, optimize=True, progressive=True)
    os.remove(out_png)

    meta = {
        'generated_by': 'render_iso_scene.py',
        'image': name + '.jpg',
        'image_px': list(res),
        'ground_z_mm': BAND_TOP,
        'track': {'shape': track['shape'], 'reach_mm': reach, 'width_mm': track['width_mm']},
        'projection': {
            'type': 'isometric_ortho',
            'azimuth_deg': AZIMUTH_DEG,
            'elevation_deg': ELEVATION_DEG,
            'ortho_width_mm': ortho,
            **projection_axes(scene, cam, res),
        },
    }
    with open(os.path.join(OUT_TRACK, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f'도시 배경 {name}.jpg 완료 (ortho {ortho:.0f}mm)', flush=True)
    return name


# ── 1인칭 뷰용 정면 스프라이트 ────────────────────────────────
# 캔버스 2D 로 원근을 그리는 화면이 쓴다. 카메라는 정면 정투영이고,
# 각 스프라이트의 실제 높이(mm)를 사이드카에 적어 두면 화면이 거리로 크기를 정한다.
OUT_CITY = os.path.join(ROOT, 'assets', 'sprites', 'city')
CITY_PX = 256
SIGNAL_COLORS = {'green': (0.10, 0.52, 0.24), 'yellow': (0.72, 0.52, 0.05), 'red': (0.66, 0.11, 0.11)}
# 아이소 뷰의 켜진 등. 작게 나와도 무슨 색인지 읽혀야 해서 더 밝게 잡는다.
BRIGHT_SIGNAL = {'green': (0.18, 0.92, 0.42), 'yellow': (1.0, 0.80, 0.12), 'red': (1.0, 0.24, 0.18)}
# 아이소 스프라이트의 켜진 등. 발광을 낮춘 대신 바탕색을 더 진하게 잡아
# 작게 줄여도 색상(빨강·노랑·초록)이 남게 한다.
LIT_SIGNAL = {'green': (0.02, 0.62, 0.16), 'yellow': (0.86, 0.52, 0.0), 'red': (0.80, 0.05, 0.05)}


def front_camera(scene, ortho_mm, res):
    scene.render.resolution_x, scene.render.resolution_y = res
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = m(ortho_mm)
    cam = bpy.data.objects.new('cam', cam_data)
    # 화면 아래끝이 지면이 되게 잡는다 — 1인칭에서 스프라이트를 그대로 땅에 세우면 맞는다.
    cam.location = Vector((0, -m(6000), m(ortho_mm / 2)))
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def city_sprite(name, build, width_mm, height_mm, model_h):
    """정면에서 본 오브젝트 한 장. 배경은 투명(PNG).

    형상은 읽기 쉬운 mm 로 만들고, 트랙 좌표계에서 실제로 차지할 크기는 model_h 하나로 정한다.
    카메라가 정사영이라 형상을 통째로 키우고 줄여도 그림은 같다 — 바뀌는 것은 크기 수치뿐이다.
    트랙 도로 폭이 360mm 이므로 신호등은 그와 비슷한 높이, 가로수·건물은 그 위로 올라간다.

    돌려주는 크기는 물건이 아니라 **그림 한 장**이 덮는 넓이다(정사각, 아래끝이 지면).
    그래야 받는 쪽이 비율을 건드리지 않고 그대로 세울 수 있다.
    """
    scene = base_scene((CITY_PX, CITY_PX), 120)
    scene.render.film_transparent = True
    lighting(scene, key_energy=3.4)
    ortho = max(width_mm, height_mm)
    front_camera(scene, ortho, (CITY_PX, CITY_PX))
    build()
    out = os.path.join(OUT_CITY, name + '.png')
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(f'스프라이트 {name}.png ({height_mm:.0f}mm)', flush=True)
    frame = ortho * model_h / height_mm
    return {'image': name + '.png', 'height_mm': frame, 'width_mm': frame}


def render_city_sprites():
    os.makedirs(OUT_CITY, exist_ok=True)
    meta = {'generated_by': 'render_iso_scene.py', 'px': CITY_PX, 'sprites': {}}

    # 등의 높이는 한 곳에서만 정한다 — 형상도, 1인칭이 쓸 발광 위치도 여기서 나온다.
    signal_h = 1400
    lamp_z = {'red': 1230, 'yellow': 1120, 'green': 1010}

    def signal(color):
        def build():
            pole = mat('pole', (0.20, 0.21, 0.23), roughness=0.4, metallic=0.6)
            case = mat('case', (0.10, 0.11, 0.13), roughness=0.4)
            on = mat('lamp_on', SIGNAL_COLORS[color], roughness=0.2)
            off = mat('lamp_off', (0.07, 0.07, 0.08), roughness=0.5)
            box('pole', 0, 0, 40, 40, 0, 900, pole)
            box('case', 0, 0, 150, 90, 900, 1300, case)
            for c, z in lamp_z.items():
                box(f'lamp_{c}', 0, -50, 90, 20, z - 45, z + 45, on if c == color else off)
        return build

    for color in ('green', 'yellow', 'red'):
        sp = city_sprite(f'signal-{color}', signal(color), 400, signal_h, 330)
        sp['lamp_y'] = (signal_h - lamp_z[color]) / signal_h   # 그림 위끝에서 켜진 등까지의 비율
        meta['sprites'][f'signal.{color}'] = sp

    def building(n, w, h, tone, model_h):
        def build():
            wall = mat('wall', tone, roughness=0.75)
            roof = mat('roof', tuple(c * 0.6 for c in tone), roughness=0.8)
            win = mat('win', (0.55, 0.68, 0.78), roughness=0.25, metallic=0.3)
            box('body', 0, 0, w, w * 0.8, 0, h, wall)
            box('roof', 0, 0, w * 0.86, w * 0.7, h, h + h * 0.08, roof)
            rows = max(2, int(h / 420))
            cols = 3
            for r in range(rows):
                for c in range(cols):
                    x = (c - (cols - 1) / 2) * (w / (cols + 0.6))
                    z = h * (0.16 + 0.72 * (r / max(1, rows - 1)))
                    box(f'w{r}{c}', x, -w * 0.41, w / (cols + 2.2), 10, z - h * 0.05, z + h * 0.05, win)
        return city_sprite(f'building-{n}', build, w * 1.2, h * 1.12, model_h)

    meta['sprites']['building.a'] = building('a', 900, 1600, (0.42, 0.40, 0.38), 1150)
    meta['sprites']['building.b'] = building('b', 1100, 2400, (0.30, 0.33, 0.38), 1700)
    meta['sprites']['building.c'] = building('c', 800, 1100, (0.38, 0.32, 0.30), 800)

    def tree():
        trunk = mat('trunk', (0.24, 0.17, 0.12), roughness=0.9)
        leaf = mat('leaf', (0.16, 0.36, 0.20), roughness=0.85)
        box('trunk', 0, 0, 60, 60, 0, 320, trunk)
        cone('leaf1', 0, 0, 260, 300, 760, leaf)
        cone('leaf2', 0, 0, 190, 700, 1050, leaf)
    meta['sprites']['tree'] = city_sprite('tree', tree, 600, 1100, 620)

    def sign():
        pole = mat('pole', (0.22, 0.23, 0.25), roughness=0.4, metallic=0.5)
        face = mat('face', (0.80, 0.80, 0.78), roughness=0.4)
        rim = mat('rim', (0.62, 0.12, 0.12), roughness=0.4)
        box('pole', 0, 0, 34, 34, 0, 700, pole)
        box('rim', 0, 0, 320, 24, 700, 1000, rim)
        box('face', 0, -14, 250, 14, 730, 970, face)
    meta['sprites']['sign'] = city_sprite('sign', sign, 400, 1050, 250)

    def pedestrian():
        skin = mat('skin', (0.82, 0.66, 0.52), roughness=0.7)
        coat = mat('coat', (0.24, 0.42, 0.66), roughness=0.8)
        leg = mat('leg', (0.18, 0.20, 0.26), roughness=0.8)
        box('leg_l', -90, 0, 110, 110, 0, 700, leg)
        box('leg_r', 90, 0, 110, 110, 0, 700, leg)
        box('body', 0, 0, 420, 200, 700, 1350, coat)
        box('arm_l', -270, 0, 110, 130, 760, 1300, coat)
        box('arm_r', 270, 0, 110, 130, 760, 1300, coat)
        box('head', 0, 0, 230, 210, 1350, 1600, skin)
    meta['sprites']['pedestrian'] = city_sprite('pedestrian', pedestrian, 600, 1600, 330)

    def barrier():
        post = mat('post', (0.26, 0.27, 0.29), roughness=0.5)
        bar = mat('bar', (0.72, 0.16, 0.14), roughness=0.4)
        white = mat('bar_w', (0.85, 0.85, 0.83), roughness=0.4)
        box('post', -420, 0, 70, 70, 0, 620, post)
        for i in range(5):
            box(f'bar{i}', -300 + i * 170, 0, 170, 30, 520, 590, bar if i % 2 == 0 else white)
    meta['sprites']['barrier'] = city_sprite('barrier', barrier, 1100, 700, 165)

    with open(os.path.join(OUT_CITY, 'city.sprites.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print('도시 스프라이트 완료', flush=True)


# ── 아이소메트릭 뷰용 도시 스프라이트 ────────────────────────
# 메인 화면(추적 뷰)이 쓴다. 카메라 각도는 배경과 같은 정투영이라 그대로 얹으면 자리가 맞는다.
# 각 스프라이트는 접지점(피벗)이 어디 찍히는지를 사이드카에 적어 둔다 — 화면은 그 값만 믿는다.
OUT_CITY_ISO = os.path.join(ROOT, 'assets', 'sprites', 'city-iso')
# 프레임을 키우고 담는 범위도 넓힌다. 신호등을 실제 비율(사람 키의 두 배쯤)로 세우려면
# 접지점 위로 700mm 가 들어가야 하는데, 900mm 프레임에는 550mm 까지밖에 담기지 않는다.
CITY_ISO_PX = 256
CITY_ISO_ORTHO_MM = 1300


def iso_sprite(scene, cam, name, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f'  아이소 스프라이트 {name} 완료', flush=True)


def render_city_iso():
    """보행자 8방위 x 걷기 2프레임, 신호등 3색 x 4방위, 차단기 팔 5단계."""
    os.makedirs(OUT_CITY_ISO, exist_ok=True)
    scene = base_scene((CITY_ISO_PX, CITY_ISO_PX), SAMPLES_SPRITE)
    scene.render.film_transparent = True
    lighting(scene, key_energy=2.6)
    cam = setup_camera(scene, CITY_ISO_ORTHO_MM, 0, (CITY_ISO_PX, CITY_ISO_PX))
    axes = projection_axes(scene, cam, (CITY_ISO_PX, CITY_ISO_PX))

    meta = {
        'generated_by': 'render_iso_scene.py',
        'frame_px': CITY_ISO_PX,
        'ortho_width_mm': CITY_ISO_ORTHO_MM,
        'mm_per_px': CITY_ISO_ORTHO_MM / CITY_ISO_PX,
        'pivot_px': axes['origin_px'],      # 원점(접지점)이 찍히는 픽셀
        'projection': {'type': 'isometric_ortho', 'azimuth_deg': AZIMUTH_DEG, 'elevation_deg': ELEVATION_DEG},
        'sets': {},
    }

    def clear():
        for ob in list(bpy.data.objects):
            if ob.type == 'MESH' and ob.name != 'shadow_catcher':
                bpy.data.objects.remove(ob, do_unlink=True)

    # ── 보행자 : 몸통·팔·다리가 구분되게. 걷기는 다리·팔 각도 두 장. ──
    skin = mat('p_skin', (0.82, 0.66, 0.52), roughness=0.7)
    coat = mat('p_coat', (0.24, 0.42, 0.66), roughness=0.8)
    legm = mat('p_leg', (0.18, 0.20, 0.26), roughness=0.8)

    def walker(step):
        """step 0: 다리 모음 / step 1: 다리 벌림. 팔은 반대로 흔든다."""
        # 어느 방위에서도 사람으로 읽혀야 한다 — 몸통을 납작하게 두면 옆에서 사라진다.
        spread = 0 if step == 0 else 40
        box('leg_l', -23 - spread * 0.4, -spread, 28, 28, 0, 150, legm)
        box('leg_r', 23 + spread * 0.4, spread, 28, 28, 0, 150, legm)
        box('body', 0, 0, 80, 60, 150, 272, coat)
        box('shoulder', 0, 0, 115, 66, 246, 275, coat)
        box('arm_l', -66, spread * 0.7, 25, 29, 157, 261, coat)
        box('arm_r', 66, -spread * 0.7, 25, 29, 157, 261, coat)
        box('head', 0, 0, 52, 49, 275, 330, skin)

    frames = []
    for step in (0, 1):
        for i in range(8):
            deg = i * 45.0
            clear()
            walker(step)
            root = bpy.data.objects.new('walk_root', None)
            scene.collection.objects.link(root)
            for ob in bpy.data.objects:
                if ob.type == 'MESH':
                    ob.parent = root
            root.rotation_euler = (0, 0, math.radians(deg))
            fn = f'ped-{int(deg):03d}-{step}.png'
            iso_sprite(scene, cam, fn, os.path.join(OUT_CITY_ISO, fn))
            frames.append({'dir': i, 'angle_deg': deg, 'step': step, 'file': fn})
            bpy.data.objects.remove(root, do_unlink=True)
    meta['sets']['pedestrian'] = {'dirs': 8, 'steps': 2, 'frames': frames}

    # ── 신호등 : 기둥 + 등 3개. 켜진 등만 밝고 나머지는 어둡다. ──
    pole_m = mat('s_pole', (0.20, 0.21, 0.23), roughness=0.4, metallic=0.6)
    case_m = mat('s_case', (0.055, 0.06, 0.07), roughness=0.4)
    # 꺼진 등도 보여야 '등이 셋'으로 읽힌다. 함체보다 확실히 밝은 회색을 쓴다 —
    # 함체와 같은 어둠으로 두면 켜진 한 칸만 보여 신호등이 아니라 색 띠가 된다.
    lamp_off = mat('s_off', (0.30, 0.31, 0.34), roughness=0.55)
    # 켜진 등은 스스로 빛나되 흰색으로 날아가면 안 된다. 세기를 1 아래로 두면
    # 화면에서 20x40px 로 줄어든 뒤에도 빨강·노랑·초록이 색으로 남는다.
    lamp_on = {c: mat(f's_on_{c}', LIT_SIGNAL[c], roughness=0.35, emission=0.65) for c in SIGNAL_COLORS}
    sig_frames = []
    for color in ('green', 'yellow', 'red'):
        for i in range(4):
            deg = i * 90.0
            clear()
            # 등 세 칸이 세로로 또렷이 나뉘어야 신호등으로 읽힌다. 칸 사이에 어두운 턱을 둔다.
            # 실물 비례로 세운다 — 보행자가 330mm 이므로 신호등 700mm 는 사람 키의 두 배쯤이다.
            # 작게 두면 화면에서 등 세 칸이 한 덩어리로 뭉친다.
            box('pole', 0, 0, 38, 38, 0, 372, pole_m)
            box('case', 0, -8, 152, 78, 358, 660, case_m)
            for k, c in enumerate(('red', 'yellow', 'green')):
                z = 610 - k * 98
                box(f'rim_{c}', 0, -38, 132, 26, z - 45, z + 45, case_m)
                box(f'lamp_{c}', 0, -54, 112, 20, z - 37, z + 37,
                    lamp_on[color] if c == color else lamp_off)
            root = bpy.data.objects.new('sig_root', None)
            scene.collection.objects.link(root)
            for ob in bpy.data.objects:
                if ob.type == 'MESH':
                    ob.parent = root
            root.rotation_euler = (0, 0, math.radians(deg))
            fn = f'signal-{color}-{int(deg):03d}.png'
            iso_sprite(scene, cam, fn, os.path.join(OUT_CITY_ISO, fn))
            sig_frames.append({'color': color, 'dir': i, 'angle_deg': deg, 'file': fn})
            bpy.data.objects.remove(root, do_unlink=True)
    meta['sets']['signal'] = {'dirs': 4, 'colors': ['green', 'yellow', 'red'], 'frames': sig_frames}

    # ── 차단기 : 팔 각도 5단계. 0도(올림) → 90도(내림). ──
    # 차단기는 신호등과 헷갈리면 안 된다. 신호등은 가늘고 높은 회색 기둥에 등 세 칸이지만,
    # 차단기는 낮고 두꺼운 흑백 줄무늬 기둥에 긴 팔이다 — 실루엣이 다르다.
    # 기둥 색으로 신호등 색(빨강·노랑·초록)을 쓰지 않는다. 색이 겹치면 작게 줄었을 때 헷갈린다.
    post_m = mat('g_post', (0.88, 0.88, 0.86), roughness=0.5)
    postd_m = mat('g_postd', (0.07, 0.07, 0.08), roughness=0.5)
    bar_m = mat('g_bar', (0.72, 0.16, 0.14), roughness=0.4)
    white_m = mat('g_white', (0.85, 0.85, 0.83), roughness=0.4)
    # 55차 보강5 5-2 — 방위 8가지를 함께 굽는다.
    # 지금까지 한 방위뿐이라, 팔이 도로 방위와 무관하게 늘 같은 화면 방향으로 뻗었다.
    # 내려도 길을 막는 것으로 안 보였고, 보는 각도에 따라 '반대로 움직인다' 로 읽혔다.
    # 이름의 각도는 '팔이 내려갔을 때 팔이 가리키는 월드 방위' 다(보행자와 같은 규칙).
    # 만들 때 팔은 +Y(90도)를 향하므로, 방위 deg 를 내려면 Z 로 (deg - 90) 만큼 돌린다.
    ARM_STEPS = 5
    ARM_DIRS = 8
    ARM_MM = 470
    gate_frames = []
    for d in range(ARM_DIRS):
        deg = d * (360.0 / ARM_DIRS)
        for i in range(ARM_STEPS):
            drop = i / (ARM_STEPS - 1)              # 0 = 올림, 1 = 내림
            ang = math.radians(90.0 * (1.0 - drop))  # 90도(수직) → 0도(수평)
            clear()
            for k in range(4):
                box(f'post{k}', 0, 0, 76, 76, 40 * k, 40 * (k + 1),
                    post_m if k % 2 == 0 else postd_m)
            arm = bpy.data.objects.new('arm_root', None)
            scene.collection.objects.link(arm)
            seg = ARM_MM / 5
            for k in range(5):
                box(f'bar{k}', 0, seg * (k + 0.5), 30, seg * 0.92, -15, 15,
                    bar_m if k % 2 == 0 else white_m)
            for ob in bpy.data.objects:
                if ob.type == 'MESH' and ob.name.startswith('bar'):
                    ob.parent = arm
            arm.location = (0, 0, m(145))
            arm.rotation_euler = (ang, 0, 0)
            # 기둥과 팔을 한 덩어리로 묶어 Z 로 돌린다 — 신호등·보행자와 같은 방식이다.
            root = bpy.data.objects.new('gate_root', None)
            scene.collection.objects.link(root)
            for ob in list(bpy.data.objects):
                if (ob.type == 'MESH' and ob.name.startswith('post')) or ob is arm:
                    ob.parent = root
            root.rotation_euler = (0, 0, math.radians(deg - 90.0))
            fn = f'gate-{int(deg):03d}-{i}.png'
            iso_sprite(scene, cam, fn, os.path.join(OUT_CITY_ISO, fn))
            gate_frames.append({'dir': d, 'angle_deg': deg, 'step': i, 'drop': round(drop, 3), 'file': fn})
            bpy.data.objects.remove(root, do_unlink=True)
            bpy.data.objects.remove(arm, do_unlink=True)
    meta['sets']['crossing_gate'] = {
        'steps': ARM_STEPS, 'dirs': ARM_DIRS, 'arm_mm': ARM_MM, 'frames': gate_frames,
    }

    with open(os.path.join(OUT_CITY_ISO, 'city-iso.sprites.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print('아이소 도시 스프라이트 완료', flush=True)


def render_sprites(kit):
    """같은 카메라 각도로 SPRITE_DIRS 방향. 접지점(피벗)은 차량 원점의 투영 위치다."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import render_kit_topview as kt

    scene = base_scene((SPRITE_PX, SPRITE_PX), SAMPLES_SPRITE)
    scene.render.film_transparent = True
    lighting(scene, key_energy=2.6)
    cam = setup_camera(scene, SPRITE_ORTHO_MM, 0, (SPRITE_PX, SPRITE_PX))

    bpy.ops.mesh.primitive_plane_add(size=m(600), location=(0, 0, 0))
    catcher = bpy.context.active_object
    catcher.name = 'shadow_catcher'
    catcher.is_shadow_catcher = True
    catcher.hide_render = True

    root, parts = kt.build_kit()

    body_dir = os.path.join(OUT_KIT, 'iso')
    shadow_dir = os.path.join(OUT_KIT, 'iso-shadow')
    os.makedirs(body_dir, exist_ok=True)
    os.makedirs(shadow_dir, exist_ok=True)

    frames = []
    step_deg = 360.0 / SPRITE_DIRS
    for i in range(SPRITE_DIRS):
        deg = i * step_deg
        # 11.25도 간격에서는 정수 도로 자르면 이름이 겹친다. 십분의 일 도까지 적는다.
        name = f'{round(deg * 10):04d}'
        root.rotation_euler = (0, 0, math.radians(deg))
        catcher.hide_render = True
        for p in parts:
            p.visible_camera = True
        scene.render.filepath = os.path.join(body_dir, name + '.png')
        bpy.ops.render.render(write_still=True)
        catcher.hide_render = False
        for p in parts:
            p.visible_camera = False
        scene.render.filepath = os.path.join(shadow_dir, name + '.png')
        bpy.ops.render.render(write_still=True)
        frames.append({'index': i, 'angle_deg': deg, 'file': name + '.png'})
        print(f'  iso frame {name} 완료', flush=True)

    axes = projection_axes(scene, cam, (SPRITE_PX, SPRITE_PX))
    meta = {
        'kit_id': kit['kit_id'],
        'generated_by': 'render_iso_scene.py',
        'projection': {'type': 'isometric_ortho', 'azimuth_deg': AZIMUTH_DEG, 'elevation_deg': ELEVATION_DEG},
        'frame_px': SPRITE_PX,
        'mm_per_px': SPRITE_ORTHO_MM / SPRITE_PX,
        'ortho_width_mm': SPRITE_ORTHO_MM,
        'pivot_px': axes['origin_px'],      # 차량 원점(접지점)이 찍히는 픽셀
        'heading_zero': '+x',
        'rotation_dir': 'ccw',
        'step_deg': step_deg,
        'frames': frames,
        'body_dir': 'iso',
        'shadow_dir': 'iso-shadow',
    }
    with open(os.path.join(OUT_KIT, 'isoview.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print('isoview.json 완료')


def backgrounds_to_render():
    """index.json 의 챌린지를 훑어 배경 슬롯별로 한 번씩 굽는다.

    챌린지를 늘려도 이 파일은 손대지 않는다 — 무엇을 구울지는 매니페스트가 정한다.
    """
    index = json.load(open(CHALLENGE_INDEX, encoding='utf-8'))
    slots = json.load(open(ASSET_MANIFEST, encoding='utf-8'))['slots']
    jobs = {}
    for entry in index['challenges']:
        path = os.path.join(ROOT, 'src', 'challenges', entry['path'])
        challenge = json.load(open(path, encoding='utf-8'))
        ref = (challenge['scene'].get('assets') or {}).get('background')
        if not ref:
            continue
        slot = slots[ref.replace('slot:', '')]
        # 매니페스트 경로에는 봉인 해시가 붙어 있다. 굽는 이름은 언제나 봉인 전 이름이어야
        # 한다 — 그러지 않으면 이번에 구운 그림이 지난번 해시 이름을 덮어써 짝이 깨진다.
        name = seal_assets.stem_of(slot['path'])
        jobs.setdefault(name, challenge)
    return jobs


# ── 규칙 모달 그림 (55차 보강5 5-2 · 파트 B) ─────────────────────────
# 살아 있는 5종 x 4장 = 20장. 목록에서 내린 4종 16장은 굽지 않는다.
# 4:3 으로 굽는다 — 모달이 네 칸을 가로로 세우고 한 칸이 200px 언저리다.
# 그 크기에서 읽히려면 글자가 아니라 '그 단계의 물건' 이 커야 한다.
# 각도는 다른 에셋과 같다(방위 225도 · 앙각 35.264도). 여기서 새로 정하지 않는다.
OUT_GUIDE = os.path.join(ROOT, 'assets', 'guide')
GUIDE_RES = (400, 300)      # 모달에서 한 칸이 200px 언저리다. 2배까지만 두면 충분하다.
GUIDE_ORTHO_MM = 1150


def shrink(path, colors=96):
    """구운 PNG 의 색 수를 줄인다. 평면 음영이라 눈으로는 같고 파일만 작아진다.

    바닥이 화면을 꽉 채우므로 이 그림에는 투명한 자리가 없다 — 알파를 버려도 잃는 것이 없다.
    RGBA 640x480 한 장이 330KB 인데, 스무 장이면 6.5MB 라 학생이 받을 것이 그만큼 늘어난다.
    """
    from PIL import Image
    im = Image.open(path).convert('RGB')
    im.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).save(path, optimize=True)


def render_guide(pick=''):
    """규칙 모달의 단계 그림. 문장은 매니페스트가 소유하고, 여기서는 물건만 세운다."""
    os.makedirs(OUT_GUIDE, exist_ok=True)
    scene = base_scene(GUIDE_RES, SAMPLES_SPRITE)
    scene.render.film_transparent = True
    lighting(scene, key_energy=2.8)
    cam = setup_camera(scene, GUIDE_ORTHO_MM, 120, GUIDE_RES)

    M = {
        'stage': mat('g_stage', (0.20, 0.22, 0.26), roughness=0.85),
        'road': mat('g_road', (0.62, 0.64, 0.67), roughness=0.85),
        'tape': mat('g_tape', (0.07, 0.08, 0.09), roughness=0.7),
        'card': mat('g_card', (0.88, 0.90, 0.93), roughness=0.75),
        'line': mat('g_line', (0.42, 0.45, 0.50), roughness=0.8),
        'hi': mat('g_hi', (0.95, 0.78, 0.20), roughness=0.55, emission=0.25),
        'red': mat('g_red', (0.86, 0.22, 0.18), roughness=0.5, emission=0.18),
        'amber': mat('g_amber', (0.93, 0.64, 0.13), roughness=0.5, emission=0.18),
        'teal': mat('g_teal', (0.11, 0.82, 0.84), roughness=0.5, emission=0.18),
        'body': mat('g_body', (0.16, 0.18, 0.22), roughness=0.5),
        'metal': mat('g_metal', (0.55, 0.58, 0.62), roughness=0.35, metallic=0.7),
        'lens': mat('g_lens', (0.06, 0.08, 0.12), roughness=0.2),
        'on': mat('g_on', (0.24, 0.90, 0.55), roughness=0.4, emission=0.9),
        'trail': mat('g_trail', (0.22, 0.62, 0.95), roughness=0.5, emission=0.3),
        'box': mat('g_box', (0.30, 0.34, 0.42), roughness=0.7),
    }

    def clear():
        for ob in list(bpy.data.objects):
            if ob.type == 'MESH':
                bpy.data.objects.remove(ob, do_unlink=True)

    def stage():
        # 화면을 꽉 채우는 바닥. 작은 칸(200px)에서 섬처럼 떠 있으면 무엇이 주인공인지 흐려진다.
        box('stage', 0, 0, 2600, 2600, -30, 0, M['stage'])

    def car(cx, cy, deg=0.0):
        """RC카 한 대. 실물 비례를 흉내만 낸다 — 여기 값은 판정에 쓰이지 않는다."""
        parts = []
        parts.append(box('c_body', cx, cy, 190, 150, 34, 96, M['body']))
        parts.append(box('c_top', cx, cy - 10, 120, 90, 96, 128, M['metal']))
        for sx in (-1, 1):
            parts.append(cyl(f'c_w{sx}', cx + sx * 104, cy, 34, 0, 44, M['tape']))
        root = bpy.data.objects.new('car_root', None)
        scene.collection.objects.link(root)
        for ob in parts:
            ob.parent = root
        root.rotation_euler = (0, 0, math.radians(deg))
        return root

    def cardface(cx, cy, lines=3, hi=-1, w=360, d=250):
        """코드 카드. 글자 대신 줄로 적는다 — 200px 에서 글자는 어차피 안 읽힌다."""
        box('cd', cx, cy, w, d, 0, 14, M['card'])
        for i in range(lines):
            y = cy + d / 2 - 46 - i * (d - 70) / max(1, lines - 1) if lines > 1 else cy
            box(f'cd_l{i}', cx - 20, y, w * 0.62, 22, 14, 20,
                M['hi'] if i == hi else M['line'])

    def slider(cx, cy, knob=0.5, tone='hi'):
        box('sl', cx, cy, 340, 26, 0, 12, M['line'])
        box('sl_k', cx - 170 + 340 * knob, cy, 46, 62, 0, 44, M[tone])

    def arrow(cx, cy, deg=0.0, length=210, tone='hi'):
        parts = [box('ar_s', cx, cy, length * 0.62, 34, 0, 22, M[tone])]
        head = box('ar_h', cx + length * 0.42, cy, 90, 90, 0, 22, M[tone])
        head.rotation_euler = (0, 0, math.radians(45))
        parts.append(head)
        root = bpy.data.objects.new('ar_root', None)
        scene.collection.objects.link(root)
        for ob in parts:
            ob.parent = root
        root.rotation_euler = (0, 0, math.radians(deg))
        return root

    def webcam(cx, cy, lit=True):
        box('wc_base', cx, cy, 190, 130, 0, 34, M['body'])
        box('wc_neck', cx, cy, 44, 44, 34, 150, M['metal'])
        box('wc_head', cx, cy, 230, 130, 150, 300, M['body'])
        cyl('wc_lens', cx - 96, cy, 52, 190, 262, M['lens'])
        box('wc_led', cx + 74, cy - 60, 34, 20, 232, 262, M['on'] if lit else M['line'])

    def plate(cx, cy, tone, z=0, tilt=0.0):
        """표지 판 한 장. 정지·서행·진행 세 색은 화면의 학습 칸 색과 같은 뜻이다."""
        ob = box(f'pl_{tone}_{int(cx)}_{int(cy)}_{int(z)}', cx, cy, 250, 250, z, z + 16, M[tone])
        if tilt:
            ob.rotation_euler = (math.radians(tilt), 0, 0)
        return ob

    def tape_square(half=380, tone='tape'):
        box('sq_floor', 0, 0, half * 2 + 200, half * 2 + 200, 0, 8, M['road'])
        for sx in (-1, 1):
            box(f'sq_x{sx}', sx * half, 0, 26, half * 2, 8, 14, M[tone])
            box(f'sq_y{sx}', 0, sx * half, half * 2, 26, 8, 14, M[tone])

    def fig8(tone='tape'):
        box('f8_floor', 0, 0, 1060, 1060, 0, 8, M['road'])
        for cy2, r in ((260, 230), (-260, 230)):
            for k in range(24):
                a = (k / 24) * math.tau
                box(f'f8_{cy2}_{k}', math.cos(a) * r, cy2 + math.sin(a) * r, 46, 46, 8, 14, M[tone])

    def trail(points, tone='trail'):
        for i, (x, y) in enumerate(points):
            box(f'tr{i}', x, y, 40, 40, 14, 22, M[tone])

    def finish(cx, cy, deg=0.0):
        parts = []
        for k in range(6):
            parts.append(box(f'fi{k}', cx, cy - 150 + k * 60, 60, 60, 8, 16,
                             M['card'] if k % 2 == 0 else M['tape']))
        root = bpy.data.objects.new('fi_root', None)
        scene.collection.objects.link(root)
        for ob in parts:
            ob.parent = root
        root.rotation_euler = (0, 0, math.radians(deg))

    # 20장. 무엇을 세우는지는 매니페스트의 문장과 짝이 맞아야 한다.
    def sb1():   # 코드 읽기 — 값 두 줄이 강조된 코드 카드
        stage(); cardface(-40, 0, lines=3, hi=1, w=520, d=380)
    def sb2():   # 값 바꾸기 — 슬라이더를 밀면 차가 더 간다
        stage(); slider(-120, 260, 0.72); car(-260, -180, 0); trail([(-60, -180), (60, -180), (180, -180)])
    def sb3():   # 한 바퀴 — 사각 코스와 결승선
        stage(); tape_square(); finish(-380, 0, 0); car(-380, -160, 90)
    def sb4():   # 줄이기 — 한 변만 붉게
        stage(); tape_square(); box('slow', 0, 380, 760, 26, 14, 26, M['red']); arrow(0, 120, -90, 200, 'red')

    def sq1():   # 곧게 가기 — 휜 궤적과 곧은 기준선
        stage(); box('ref', 0, 200, 900, 18, 0, 8, M['line'])
        car(-360, -180, 12); trail([(-160, -150), (40, -100), (240, -20), (400, 90)])
    def sq2():   # 값 맞추기 — 좌우 바퀴 값이 다르다
        stage(); car(0, -140, 90)
        box('lv', -220, 180, 90, 90, 0, 150, M['line']); box('rv', 220, 180, 90, 90, 0, 250, M['hi'])
    def sq3():   # 한 바퀴 — 이탈 없이
        stage(); tape_square(); trail([(-300, -300), (0, -300), (300, -300), (300, 0), (300, 300)])
        car(-380, -160, 90); finish(-380, 0, 0)
    def sq4():   # 줄이기 — 다른 변을 강조
        stage(); tape_square(); box('slow2', 380, 0, 26, 760, 14, 26, M['red']); arrow(120, 0, 180, 200, 'red')

    def f81():   # 코스 보기 — 8자
        stage(); fig8()
    def f82():   # 회전 맞추기 — 교차점에서 좌우 화살표
        stage(); fig8(); car(0, 0, 45); arrow(-300, 0, 150, 200, 'hi'); arrow(300, 0, -30, 200, 'teal')
    def f83():   # 한 바퀴
        stage(); fig8(); finish(0, 0, 45); car(-140, -140, 45)
    def f84():   # 줄이기 — 한쪽 고리를 강조
        stage(); fig8()
        for k in range(24):
            a = (k / 24) * math.tau
            box(f'hl{k}', math.cos(a) * 230, 260 + math.sin(a) * 230, 54, 54, 14, 26, M['red'])

    def wc1():   # 카메라 켜기
        stage(); webcam(-60, 0, lit=True)
    def wc2():   # 색 맞추기 — 물체를 비추고 슬라이더로
        stage(); webcam(-260, 160); cyl('ball', 200, -40, 130, 0, 260, M['red'])
        slider(-40, -380, 0.62, 'red')
    def wc3():   # 코드에 넣기 — 슬라이더에서 카드로
        stage(); slider(-300, 260, 0.62, 'red'); arrow(-40, 40, -50, 240, 'hi')
        cardface(240, -220, lines=3, hi=0, w=420, d=300)
    def wc4():   # 몰아 보기 — 물체를 따라 꺾는다
        stage(); car(-260, -220, 30); cyl('ball2', 260, 200, 120, 0, 240, M['red'])
        trail([(-90, -140), (60, -40), (180, 70)])

    def sc1():   # 카메라 켜기 (허용까지)
        stage(); webcam(-200, 60, lit=True); plate(240, -200, 'red')
    def sc2():   # 담을 칸 고르기 — 셋 중 하나가 들려 있다
        stage(); plate(-300, -40, 'red', z=250); plate(20, -40, 'amber'); plate(340, -40, 'teal')
        box('pick_mark', -300, -40, 250, 250, 0, 8, M['line'])   # 들어 올린 자리
        arrow(-300, 320, -90, 210, 'hi')
    def sc3():   # 데이터 수집 — 같은 판을 여러 장
        stage(); webcam(-280, 200)
        for k in range(4):
            plate(120 + k * 26, -160 + k * 26, 'red', z=k * 22)
    def sc4():   # 학습하기 — 세 더미가 상자로
        stage()
        for i, tone in enumerate(('red', 'amber', 'teal')):
            for k in range(3):
                plate(-340, 240 - i * 240, tone, z=k * 34)
        arrow(30, 0, 0, 210, 'hi'); box('model', 340, 0, 260, 260, 0, 260, M['box'])

    JOBS = {
        'square-beginner': [sb1, sb2, sb3, sb4],
        'square-basic': [sq1, sq2, sq3, sq4],
        'figure8-basic': [f81, f82, f83, f84],
        'webcam-drive-basic': [wc1, wc2, wc3, wc4],
        'smartcity-drive': [sc1, sc2, sc3, sc4],
    }
    made = []
    for cid, steps in JOBS.items():
        if pick and pick != cid:
            continue
        for i, build in enumerate(steps):
            clear()
            build()
            fn = f'{cid}-{i + 1}.png'
            scene.render.filepath = os.path.join(OUT_GUIDE, fn)
            bpy.ops.render.render(write_still=True)
            # 640x480 RGBA 로 두면 한 장이 330KB 다. 스무 장이면 6.5MB —
            # 평면 음영 그림이라 색을 줄여도 눈에 띄지 않는다. 여기서 줄여 두면
            # 브라우저가 받을 것이 그만큼 줄어든다.
            shrink(os.path.join(OUT_GUIDE, fn))
            made.append(fn)
            print(f'  규칙 그림 {fn} 완료', flush=True)
    if pick:
        print(f'규칙 그림 {len(made)}장 (일부만) — 목록 파일은 그대로 둔다', flush=True)
        return
    with open(os.path.join(OUT_GUIDE, 'guide.json'), 'w', encoding='utf-8') as f:
        json.dump({
            'generated_by': 'render_iso_scene.py',
            'frame_px': list(GUIDE_RES),
            'ortho_width_mm': GUIDE_ORTHO_MM,
            'projection': {'type': 'isometric_ortho', 'azimuth_deg': AZIMUTH_DEG,
                           'elevation_deg': ELEVATION_DEG},
            'files': made,
        }, f, ensure_ascii=False, indent=2)
    print(f'규칙 모달 그림 {len(made)}장 완료', flush=True)


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else 'all'
    kit = json.load(open(KIT, encoding='utf-8'))
    if only in ('all', 'bg'):
        pick = sys.argv[2] if len(sys.argv) > 2 else ''
        jobs = backgrounds_to_render()
        # 이름이 정확히 맞으면 그것만 굽는다. 'iso-square-1200' 은 'iso-square-1200-drive' 의
        # 앞부분이기도 해서, 부분 일치만 두면 손댈 생각이 없던 배경까지 다시 구워진다.
        only_one = pick in jobs
        for name, challenge in jobs.items():
            if pick and (name != pick if only_one else pick not in name):
                continue
            # 도시 구성물이 있는 챌린지는 도시 렌더러로 간다. 무엇을 그릴지는 매니페스트가 정한다.
            if challenge['scene'].get('decisions'):
                # 50차: 스마트시티 배경은 44차 그대로 두기로 했다. 'bg' 만 주고 돌렸을 때
                # 함께 구워져 덮인 적이 있다 — 이름을 정확히 지정했을 때만 굽는다.
                if not only_one:
                    print(f'배경 {name} 건너뜀 (도시 배경은 이름을 정확히 지정해야 굽는다)', flush=True)
                    continue
                render_city(challenge, name)
            else:
                render_background(challenge, name)
    if only in ('all', 'sprites'):
        render_sprites(kit)
    if only in ('all', 'city'):
        render_city_sprites()
    if only in ('all', 'cityiso'):
        render_city_iso()
    if only in ('all', 'guide'):
        render_guide(sys.argv[2] if len(sys.argv) > 2 else '')
    # 구운 뒤에는 반드시 봉인한다. 파일명에 내용 해시를 박아 두지 않으면
    # 브라우저·CDN 이 이미지만 또는 사이드카만 새로 받는 순간 화면이 어긋난다.
    seal_assets.main()


if __name__ == '__main__':
    main()
