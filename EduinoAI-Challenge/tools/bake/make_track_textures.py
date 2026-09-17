"""
tools/bake/make_track_textures.py — 교실 바닥 / 라인테이프 / 색상 마커 / 조명 오버레이 텍스처.

빌드 단계 스크립트다. 결과 PNG 만 커밋하며 앱은 이미지 파일만 읽는다.
런타임에서 텍스처를 절차적으로 만들지 않는다.

seamless 보장 방식
  Blender 의 Noise/Voronoi 는 타일링되지 않는다. 그래서 바닥 질감의 바탕 노이즈는
  numpy 로 주파수 영역에서 합성한다(역FFT 결과는 정의상 주기적 = 이음매 없음).
  그 이미지를 Blender 머티리얼의 입력으로 넣고 UV 로 매핑해 베이크하듯 정투영 렌더한다.
  머티리얼이 UV 의 주기 함수와 타일링 이미지로만 이루어지므로 결과도 타일링된다.
"""

import json
import math
import os
import sys

import numpy as np
from PIL import Image

import bpy

# 56차 — tools/bake/ 로 옮겨 한 칸 깊어졌다. 저장소 뿌리까지 '..' 이 둘이다.
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..',
                       'assets', 'tracks', 'classroom')

# 물리 스케일 — 렌더러가 mm 를 px 로 환산할 때 쓴다.
FLOOR_TILE_MM = 600.0     # floor.png 한 장이 덮는 실제 크기
FLOOR_PX = 1024
TAPE_LEN_MM = 200.0       # tape 텍스처 한 장의 길이
TAPE_WIDTH_MM = 25.0      # 텍스처에 담긴 폭(테이프 19mm + 여백)
TAPE_PX = (512, 64)
MARKER_PX = 256
MARKER_MM = 60.0
# 모드2 색상 마커. 색을 늘릴 때 여기에 한 줄만 더한다 — 코드로 색을 칠하지 않는다.
MARKER_COLORS = [
    ('marker-red.png', (0.52, 0.03, 0.04), 59),
    ('marker-blue.png', (0.03, 0.04, 0.52), 73),
]
OVERLAY_PX = 1024


# ---------------------------------------------------------------- 타일링 노이즈
def tileable_noise(size, exponent=2.0, seed=0):
    """주파수 영역에서 1/f^n 스펙트럼을 합성 → 역FFT. 결과는 정의상 상하좌우로 이어진다."""
    rng = np.random.default_rng(seed)
    fx = np.fft.fftfreq(size)[:, None]
    fy = np.fft.fftfreq(size)[None, :]
    radius = np.sqrt(fx ** 2 + fy ** 2)
    radius[0, 0] = 1.0
    spectrum = (rng.normal(size=(size, size)) + 1j * rng.normal(size=(size, size)))
    spectrum *= radius ** (-exponent)
    spectrum[0, 0] = 0
    field = np.real(np.fft.ifft2(spectrum))
    field -= field.min()
    field /= max(field.max(), 1e-9)
    return field


def tileable_grout(size, tiles=2, line_px=3.0, soft=2.5):
    """타일 이음선 마스크. 0..1 주기 위치에만 선이 있으므로 정의상 타일링된다."""
    u = (np.arange(size) + 0.5) / size * tiles
    du = np.minimum(u % 1.0, 1.0 - (u % 1.0)) * size / tiles     # 가장 가까운 이음선까지 거리(px)
    line = np.clip(1.0 - (du - line_px * 0.5) / soft, 0, 1)
    mask = np.maximum(line[:, None], line[None, :])
    return 1.0 - mask * 0.28                                      # 선 위치가 살짝 어둡다(테이프보다 약하게)


def save_gray(path, array):
    Image.fromarray((np.clip(array, 0, 1) * 255).astype(np.uint8), mode='L').save(path)


# ---------------------------------------------------------------- Blender 공용
def reset_scene(res_x, res_y, transparent=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'

    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.52, 0.55, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    scene.world = world
    return scene


def ortho_camera(scene, width_units, aspect_units):
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = max(width_units, aspect_units)
    cam = bpy.data.objects.new('cam', cam_data)
    cam.location = (0, 0, 2)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def sun(scene, energy, direction, angle_deg=12):
    from mathutils import Vector
    data = bpy.data.lights.new('sun', type='SUN')
    data.energy = energy
    data.angle = math.radians(angle_deg)
    obj = bpy.data.objects.new('sun', data)
    obj.rotation_euler = Vector(direction).normalized().to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(obj)
    return obj


def image_node(nt, path, non_color=True):
    node = nt.nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(path)
    if non_color:
        node.image.colorspace_settings.name = 'Non-Color'
    node.extension = 'REPEAT'
    node.interpolation = 'Cubic'
    return node


# ---------------------------------------------------------------- 1) 바닥 질감
# 계열마다 다른 공간으로 읽히려면 바닥부터 달라야 한다(50차).
# 만드는 방식은 교실 바닥과 똑같고 색·이음선·거칠기만 다르다 —
# 밝기 곱(주행 대역 1.0 / 코스 밖 0.30)은 배경 렌더가 그대로 쥐고 있으므로
# 어느 바닥을 깔아도 노면과 코스 밖의 밝기 비는 변하지 않는다.
FLOORS = [
    # (파일 이름, 어두운 얼룩, 밝은 바탕, 이음선 개수, 이음선 굵기, 거칠기, 요철, 씨드, 잔결 비중)
    ('floor.png', (0.42, 0.41, 0.39), (0.60, 0.59, 0.56), 2, 2.0, 0.55, 0.10, (11, 27), 0.45),
    # 레이스장 카펫 — 이음선이 없고 잔결이 촘촘해 융단으로 읽힌다.
    ('floor-carpet.png', (0.26, 0.30, 0.39), (0.47, 0.51, 0.60), 0, 0.0, 0.90, 0.30, (61, 67), 0.92),
    # 물류창고 콘크리트 — 판이 크고 얼룩이 굵으며 이음선이 뚜렷하다.
    ('floor-concrete.png', (0.41, 0.43, 0.46), (0.63, 0.64, 0.66), 1, 4.5, 0.74, 0.05, (83, 89), 0.12),
]


def render_floor(tmp_dir, out_name='floor.png', dark=(0.42, 0.41, 0.39), light=(0.60, 0.59, 0.56),
                 grout_tiles=2, grout_line=2.0, roughness=0.55, bump_strength=0.10, seeds=(11, 27),
                 fine_mix=0.45):
    """저채도 장판/타일 바닥.

    이음매 없이 만들기 위해 두 가지를 지킨다.
      1) 모든 텍스처 입력을 numpy 로 만든 타일링 이미지로 두고, 월드 좌표로 매핑한다.
         (Blender 의 Noise/Wave 는 UV 주기와 맞지 않아 이음매가 생긴다)
      2) 평면을 카메라 프레임보다 크게 만든다. 프레임과 같은 크기면 테두리 픽셀이
         배경과 섞여 가장자리에 밝은 띠가 남는다.
    """
    fine = tileable_noise(512, exponent=1.1, seed=seeds[0])
    coarse = tileable_noise(512, exponent=2.6, seed=seeds[1])
    # 이음선이 0개면 마스크를 1 로 둔다 — 카펫처럼 판 경계가 없는 바닥이 된다.
    grout = (tileable_grout(512, tiles=grout_tiles, line_px=grout_line, soft=2.0)
             if grout_tiles else np.ones((512, 512)))
    paths = {}
    for key, arr in (('fine', fine), ('coarse', coarse), ('grout', grout)):
        paths[key] = os.path.join(tmp_dir, f'_floor_{key}.png')
        save_gray(paths[key], arr)

    scene = reset_scene(FLOOR_PX, FLOOR_PX)
    ortho_camera(scene, 1.0, 1.0)
    sun(scene, 2.2, (0.25, -0.3, -0.9), angle_deg=25)

    bpy.ops.mesh.primitive_plane_add(size=1.4, location=(0, 0, 0))   # 프레임(1.0)보다 크게
    plane = bpy.context.active_object

    mat = bpy.data.materials.new('floor')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']

    # 월드 좌표 매핑: 보이는 영역 [-0.5, 0.5] 가 텍스처 한 주기와 정확히 일치한다.
    geo = nt.nodes.new('ShaderNodeNewGeometry')

    def tex(path):
        node = image_node(nt, path)
        nt.links.new(geo.outputs['Position'], node.inputs['Vector'])
        return node

    fine_tex, coarse_tex, grout_tex = tex(paths['fine']), tex(paths['coarse']), tex(paths['grout'])

    mix_noise = nt.nodes.new('ShaderNodeMixRGB')
    mix_noise.blend_type = 'MIX'
    mix_noise.inputs['Fac'].default_value = fine_mix
    nt.links.new(coarse_tex.outputs['Color'], mix_noise.inputs['Color1'])
    nt.links.new(fine_tex.outputs['Color'], mix_noise.inputs['Color2'])

    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.32
    ramp.color_ramp.elements[0].color = (*dark, 1)              # 어두운 얼룩
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = (*light, 1)             # 밝은 바탕
    nt.links.new(mix_noise.outputs['Color'], ramp.inputs['Fac'])

    seams = nt.nodes.new('ShaderNodeMixRGB')
    seams.blend_type = 'MULTIPLY'
    seams.inputs['Fac'].default_value = 1.0
    nt.links.new(ramp.outputs['Color'], seams.inputs['Color1'])
    nt.links.new(grout_tex.outputs['Color'], seams.inputs['Color2'])
    nt.links.new(seams.outputs['Color'], bsdf.inputs['Base Color'])

    bsdf.inputs['Roughness'].default_value = roughness
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = bump_strength
    nt.links.new(fine_tex.outputs['Color'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    plane.data.materials.append(mat)
    scene.render.filepath = os.path.join(OUT_DIR, out_name)
    bpy.ops.render.render(write_still=True)
    return out_name


# ---------------------------------------------------------------- 2) 라인 테이프
def render_tape(tmp_dir, name, base_color, seed):
    """검정 절연테이프. 길이 방향으로 타일링되고, 폭 방향은 가장자리 들뜸을 표현한다."""
    grain = tileable_noise(256, exponent=1.6, seed=seed)
    grain_path = os.path.join(tmp_dir, f'_tape_grain_{seed}.png')
    save_gray(grain_path, grain)

    scene = reset_scene(*TAPE_PX, transparent=True)
    aspect = TAPE_PX[0] / TAPE_PX[1]
    ortho_camera(scene, 1.0, 1.0)
    sun(scene, 2.6, (0.3, -0.5, -0.8), angle_deg=8)

    # 폭 방향으로 살짝 볼록한 스트립 (가장자리 들뜸).
    # 길이 방향은 프레임 밖까지 늘려 끝단이 잘리지 않게 하고, 폭은 여백을 남긴다.
    frame_half_y = 0.5 / aspect
    tape_half_y = frame_half_y * (19.0 / TAPE_WIDTH_MM) * 0.5 * 2 * 0.5 + frame_half_y * 0.0
    tape_half_y = frame_half_y * (19.0 / TAPE_WIDTH_MM)
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=96, y_subdivisions=24, size=1.0)
    strip = bpy.context.active_object
    for v in strip.data.vertices:
        v.co.x *= 1.35                                  # 프레임 밖까지
        v.co.y *= tape_half_y * 2
        t = v.co.y / tape_half_y                        # -1..1
        v.co.z = (1.0 - t ** 2) * 0.004 + math.cos(v.co.x * math.pi * 4) * 0.0004 * abs(t)

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*base_color, 1)
    bsdf.inputs['Roughness'].default_value = 0.22       # 비닐 특유의 옅은 광택

    grain_tex = image_node(nt, grain_path)
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    nt.links.new(geo.outputs['Position'], grain_tex.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.08
    nt.links.new(grain_tex.outputs['Color'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    rough_mix = nt.nodes.new('ShaderNodeMapRange')
    rough_mix.inputs['To Min'].default_value = 0.16
    rough_mix.inputs['To Max'].default_value = 0.34
    nt.links.new(grain_tex.outputs['Color'], rough_mix.inputs['Value'])
    nt.links.new(rough_mix.outputs['Result'], bsdf.inputs['Roughness'])

    strip.data.materials.append(mat)
    scene.render.filepath = os.path.join(OUT_DIR, name)
    bpy.ops.render.render(write_still=True)
    return name


# ---------------------------------------------------------------- 3) 색상 마커
def render_marker(tmp_dir, name, base_color, seed):
    """모드2 용 색상 테이프 조각. 색만 바꿔 파일을 늘릴 수 있게 분리해 둔다."""
    grain = tileable_noise(256, exponent=1.6, seed=seed)
    grain_path = os.path.join(tmp_dir, f'_marker_grain_{seed}.png')
    save_gray(grain_path, grain)

    scene = reset_scene(MARKER_PX, MARKER_PX, transparent=True)
    ortho_camera(scene, 1.0, 1.0)
    sun(scene, 2.6, (0.3, -0.5, -0.8), angle_deg=10)

    bpy.ops.mesh.primitive_grid_add(x_subdivisions=48, y_subdivisions=48, size=0.78)
    piece = bpy.context.active_object
    for v in piece.data.vertices:
        tx, ty = v.co.x / 0.39, v.co.y / 0.39
        v.co.z = (1.0 - max(abs(tx), abs(ty)) ** 6) * 0.004
        # 잘린 끝단이 살짝 삐뚤게
        v.co.x += math.sin(ty * 3.1) * 0.004

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*base_color, 1)
    bsdf.inputs['Roughness'].default_value = 0.26
    grain_tex = image_node(nt, grain_path)
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.06
    nt.links.new(grain_tex.outputs['Color'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    piece.data.materials.append(mat)
    scene.render.filepath = os.path.join(OUT_DIR, name)
    bpy.ops.render.render(write_still=True)
    return name


# ---------------------------------------------------------------- 4) 조명 오버레이
def make_light_overlay():
    """상단광 + 비네팅.

    한 장의 RGBA 로 '밝은 곳'과 '어두운 곳'을 동시에 표현하려 하면 두 영역의 경계가
    이진으로 갈려 사다리꼴 같은 인위적 형태가 남는다. 그래서 오버레이는 검정 한 색으로만 두고
    위쪽을 덜 어둡게, 아래와 가장자리를 더 어둡게 해서 상단광처럼 보이게 한다.
    """
    n = OVERLAY_PX
    y, x = np.mgrid[0:n, 0:n]
    v = y / (n - 1)                                   # 0(위) ~ 1(아래)
    u = x / (n - 1)

    base = 0.04 + 0.17 * v ** 1.15                    # 위에서 아래로 완만하게 어두워진다
    edge = np.maximum(np.abs(u - 0.5), np.abs(v - 0.5)) * 2.0
    vignette = np.clip((edge - 0.72) / 0.28, 0, 1) ** 1.8 * 0.26

    rgba = np.zeros((n, n, 4), dtype=np.float32)      # 색은 검정 고정, 알파만 변한다
    rgba[..., 3] = np.clip(base + vignette, 0, 1)
    Image.fromarray((rgba * 255).astype(np.uint8), mode='RGBA').save(
        os.path.join(OUT_DIR, 'light-overlay.png'))
    return 'light-overlay.png'


def main():
    # 인자로 'markers' 를 주면 색상 마커만 다시 굽는다. 이미 확정된 바닥·테이프는 건드리지 않는다.
    only = sys.argv[1] if len(sys.argv) > 1 else 'all'
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp_dir = os.path.join(OUT_DIR, '_tmp')
    os.makedirs(tmp_dir, exist_ok=True)

    files = {}
    if only == 'floors':
        # 바닥만 다시 굽는다. 확정된 테이프·마커·오버레이는 건드리지 않는다.
        for name, dark, light, tiles, line, rough, bump, seeds, fmix in FLOORS:
            render_floor(tmp_dir, name, dark, light, tiles, line, rough, bump, seeds, fmix)
            print(f'{name} 완료', flush=True)
        for f in os.listdir(tmp_dir):
            os.remove(os.path.join(tmp_dir, f))
        os.rmdir(tmp_dir)
        return

    if only == 'markers':
        for name, color, seed in MARKER_COLORS:
            render_marker(tmp_dir, name, color, seed)
            print(f'{name} 완료', flush=True)
        for f in os.listdir(tmp_dir):
            os.remove(os.path.join(tmp_dir, f))
        os.rmdir(tmp_dir)
        return

    for name, dark, light, tiles, line, rough, bump, seeds, fmix in FLOORS:
        files[name] = render_floor(tmp_dir, name, dark, light, tiles, line, rough, bump, seeds, fmix)
        print(f'{name} 완료', flush=True)
    files['tape'] = render_tape(tmp_dir, 'tape-black.png', (0.016, 0.016, 0.018), seed=41)
    print('tape-black.png 완료', flush=True)
    for name, color, seed in MARKER_COLORS:
        files[name] = render_marker(tmp_dir, name, color, seed)
        print(f'{name} 완료', flush=True)
    files['overlay'] = make_light_overlay()
    print('light-overlay.png 완료', flush=True)

    for f in os.listdir(tmp_dir):
        os.remove(os.path.join(tmp_dir, f))
    os.rmdir(tmp_dir)

    meta = {
        'id': 'classroom',
        'generated_by': 'make_track_textures.py',
        'slots': {
            'track.floor': {
                'file': files['floor'], 'tiling': 'both',
                'tile_mm': FLOOR_TILE_MM,
                'note': '교실 장판. 주행 대역 채우기에 사용한다.',
            },
            'track.tape': {
                'file': files['tape'], 'tiling': 'length',
                'length_mm': TAPE_LEN_MM, 'width_mm': TAPE_WIDTH_MM, 'tape_mm': 19.0,
                'note': '검정 절연테이프. 주행 대역 경계선에 사용한다.',
            },
            **{
                f"marker.{name.split('-')[1].split('.')[0]}": {
                    'file': files[name], 'tiling': 'none', 'size_mm': MARKER_MM,
                    'note': '모드2 색상 마커. 색을 늘릴 때 MARKER_COLORS 에 한 줄만 더한다.',
                }
                for name, _, _ in MARKER_COLORS
            },
            'overlay.light': {
                'file': files['overlay'], 'tiling': 'none',
                'note': '상단광 + 비네팅. 씬 위에 별도 레이어로 얹는다.',
            },
        },
    }
    with open(os.path.join(OUT_DIR, '..', 'tracks.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': 1, 'tracks': {'classroom': meta}}, f, ensure_ascii=False, indent=2)
    print('tracks.json 기록 완료')


if __name__ == '__main__':
    main()
