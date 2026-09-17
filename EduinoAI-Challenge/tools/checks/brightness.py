"""
tools/checks/brightness.py — 노면이 화면에서 가장 밝은 면인가.

왜 있는가:
  39차에 정한 규칙이다 — 노면이 코스 밖보다 1.5배 밝아야 학생이 자기 차가 노면 위인지
  한눈에 안다. 50차에 계열 테마 소품이 들어오면서 이 규칙이 두 번 깨졌다.
  한 번은 도시 인도를 밝게 깔았을 때(비 1.04), 한 번은 레이스장 흰 펜스가 노면보다
  밝은데도 평균 조건은 통과했을 때다.

무엇을 보는가:
  (1) 노면 평균 / 코스 밖 평균 >= 1.5
  (2) 코스 밖의 어떤 지점도 노면 평균보다 밝지 않을 것 (코스 밖 최대 < 노면 평균)

  (1)만 보면 어두운 바닥이 평균을 끌어내려, 펜스처럼 밝은 소품 하나가 코스보다
  눈에 띄어도 통과한다. 소품이 테마를 알려주는 일은 형태가 하고 밝기로 하지 않는다.

표본 자리는 매니페스트의 중심선에서 나온다 — 코스 형상을 이 파일에 적지 않는다.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
MIN_RATIO = 1.5
# 53차 — 채도는 "가장 진한 한 점" 이 아니라 "넓이" 로 본다.
# 한 점으로 재면 러버콘·마커처럼 작고 진한 소품까지 걸려 색 있는 테마가 성립하지 않는다.
# 눈에 먼저 들어오는 것은 진한 면이 넓을 때다.
SAT_VIVID = 0.40        # 이 채도를 넘으면 "진한 픽셀" 로 센다
MAX_VIVID_AREA = 0.06   # 코스 밖 표본에서 진한 면이 차지하는 비율의 한도(6%)
OFF_MARGIN_MM = 250.0   # 노면 가장자리에서 이만큼 밖부터 '코스 밖'으로 본다
SPAN_PAD_MM = 1400.0    # 코스 밖 격자를 코스 반경 바깥으로 이만큼 더 훑는다
GRID = 44               # 한 변의 표본 수


def lum(px):
    return 0.2126 * px[..., 0] / 255 + 0.7152 * px[..., 1] / 255 + 0.0722 * px[..., 2] / 255


def sat(px):
    """HSV 채도. 밝기는 통과해도 채도가 높으면 화면에서 그쪽이 먼저 눈에 띈다(53차)."""
    mx = px.max(axis=-1)
    mn = px.min(axis=-1)
    return np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0)


def centerline(track):
    if track['shape'] == 'square':
        h = track['center_side_mm'] / 2
        return [(-h, -h), (h, -h), (h, h), (-h, h)]
    return [tuple(p) for p in track['points']]


def dist_to_path(pts, x, y):
    best = 1e18
    for i in range(len(pts)):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % len(pts)]
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        u = 0 if l2 == 0 else max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / l2))
        best = min(best, math.hypot(x - (ax + dx * u), y - (ay + dy * u)))
    return best


def main():
    mf = json.load(open(os.path.join(ROOT, 'assets', 'assets.manifest.json'), encoding='utf-8'))
    allow = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'brightness.allow.json'), encoding='utf-8'))
    excused = {e['slot']: e['why'] for e in allow.get('excluded', [])}
    idx = json.load(open(os.path.join(ROOT, 'src', 'challenges', 'index.json'), encoding='utf-8'))

    slot_track = {}
    for c in idx['challenges']:
        ch = json.load(open(os.path.join(ROOT, 'src', 'challenges', c['path']), encoding='utf-8'))
        ref = (ch['scene'].get('assets') or {}).get('background')
        if ref:
            slot_track.setdefault(ref.replace('slot:', ''), ch['scene']['track'])

    rows = []
    print('배경                              노면 평균  코스밖 평균    비   코스밖 최대  노면채도%  진한면적%  최대채도%   판정')
    for slot_id, slot in sorted(mf['slots'].items()):
        if slot.get('type') != 'scene_background':
            continue
        track = slot_track.get(slot_id)
        if not track:
            continue
        p = os.path.join(ROOT, 'assets', slot['path'])
        meta = json.load(open(p, encoding='utf-8'))
        pr = meta['projection']
        o, ax, ay = pr['origin_px'], pr['x_axis_px'], pr['y_axis_px']
        img = np.asarray(Image.open(os.path.join(os.path.dirname(p), meta['image'])).convert('RGB')).astype(np.float32)
        H, W = img.shape[:2]

        def sample(x, y, rad=6):
            px = o[0] + ax[0] * x + ay[0] * y
            py = o[1] + ax[1] * x + ay[1] * y
            xi, yi = int(round(px)), int(round(py))
            if not (rad <= xi < W - rad and rad <= yi < H - rad):
                return None
            box = img[yi - rad:yi + rad, xi - rad:xi + rad]
            return (float(lum(box).mean()), float(sat(box).mean()))

        pts = centerline(track)
        halfw = track['width_mm'] / 2
        on = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            for t in np.linspace(0.15, 0.85, 12):
                v = sample(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
                if v is not None:
                    on.append(v)
        reach = max(max(abs(x), abs(y)) for x, y in pts)
        span = reach + halfw + SPAN_PAD_MM
        off = []
        for x in np.linspace(-span, span, GRID):
            for y in np.linspace(-span, span, GRID):
                if dist_to_path(pts, x, y) < halfw + OFF_MARGIN_MM:
                    continue
                v = sample(float(x), float(y))
                if v is not None:
                    off.append((v[0], float(x), float(y), v[1]))
        if not on or not off:
            print(f'{slot_id:32s} 표본 부족 ({len(on)}/{len(off)})')
            rows.append((slot_id, False))
            continue
        road = float(np.mean([v[0] for v in on]))
        road_sat = float(np.mean([v[1] for v in on]))
        off_mean = float(np.mean([v[0] for v in off]))
        ratio = road / off_mean if off_mean > 0 else float('inf')
        peak = max(off)
        sat_peak = max(off, key=lambda r: r[3])
        # 53차 — 코스 밖에서 진한 면이 차지하는 넓이. 표본 하나가 한 조각의 면적을 대표한다.
        vivid = [r for r in off if r[3] >= SAT_VIVID]
        vivid_area = len(vivid) / len(off)
        sat_ok = vivid_area <= MAX_VIVID_AREA
        ok = ratio >= MIN_RATIO and peak[0] < road and sat_ok
        mark = 'ok'
        if ratio < MIN_RATIO:
            mark = '비 미달'
        elif peak[0] >= road:
            mark = '코스 밖이 더 밝음'
        elif not sat_ok:
            mark = '진한 면이 넓음'
        if not ok and slot_id in excused:
            mark += ' (예외)'
        print(f'{slot_id:32s} {road:8.3f} {off_mean:11.3f} {ratio:6.2f} {peak[0]:11.3f}'
              f' {road_sat * 100:9.1f} {vivid_area * 100:10.1f} {sat_peak[3] * 100:9.1f}   {mark}')
        if peak[0] >= road:
            print(f'{"":32s}   가장 밝은 자리 ({peak[1]:.0f}, {peak[2]:.0f}) — 노면 평균보다 {peak[0] - road:+.3f}')
        if not sat_ok:
            print(f'{"":32s}   진한 면 {len(vivid)}/{len(off)} 표본 = {vivid_area * 100:.1f}%'
                  f' (한도 {MAX_VIVID_AREA * 100:.0f}%) · 가장 진한 자리'
                  f' ({sat_peak[1]:.0f}, {sat_peak[2]:.0f}) 채도 {sat_peak[3] * 100:.1f}%')
        rows.append((slot_id, ok or slot_id in excused))

    for slot_id, why in excused.items():
        print(f'\n예외 {slot_id} — {why}')
    # 57차 보강2 — 잰 배경이 하나도 없으면 통과가 아니다. 본 것이 없다는 뜻이다.
    if not rows:
        print('\n잰 배경 0개 — 본 것이 없습니다. 통과로 세지 않습니다.')
        sys.exit(1)
    bad = [r for r in rows if not r[1]]
    print(f'\n잰 배경 {len(rows)}개 · 실패 {len(bad)}/{len(rows)} · 기준: 잰 배경 1개 이상'
          f' · 노면 평균 / 코스 밖 평균 >= {MIN_RATIO}'
          f' · 코스 밖 어느 지점도 노면 평균보다 밝지 않을 것'
          f' · 코스 밖에서 채도 {SAT_VIVID * 100:.0f}% 넘는 면이 {MAX_VIVID_AREA * 100:.0f}% 이하')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
