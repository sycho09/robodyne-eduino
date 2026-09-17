# 에셋 슬롯

**코드로 그림을 그리지 않는다.** 비주얼은 전부 이 폴더의 슬롯으로 들어온다.

## 규약

1. 챌린지 매니페스트와 킷 파일은 `"slot:<id>"` 문자열로만 에셋을 참조한다.
   (예: `"car": "slot:car.2wd"`)
2. 슬롯 id → 실제 파일 경로 매핑은 `assets.manifest.json` 한 곳에서만 한다.
3. `path` 가 `null` 이면 슬롯이 비어 있는 것이다. 렌더러는 이때
   **형상 플레이스홀더**(트랙 경계선, 차체 사각형)만 그리고 화면 하단에 비어 있는 슬롯 이름을 표시한다.
4. 이미지가 채워지면 렌더러가 자동으로 그쪽을 쓴다. 코드 수정이 필요 없다.

## 채우는 방법

```
assets/sprites/car-2wd.png        <- 파일을 넣고
assets/assets.manifest.json       <- "car.2wd".path 를 "./sprites/car-2wd.png" 로 바꾼다
```

경로는 `assets.manifest.json` 기준 상대경로다.

## 슬롯 종류

| type | 내용 |
| --- | --- |
| `sprite` | 단일 이미지 |
| `texture` | 단일 이미지 + 물리 스케일 메타(`tile_mm`, `length_mm` 등) |
| `sprite_frames` | 프리렌더 시트. `path` 가 메타 JSON 을 가리키고, 프레임과 그림자를 모두 불러온다 |
| `scene_background` | 프리렌더 배경. 사이드카 JSON 이 이미지 경로와 투영 축을 함께 들고 있다 |
| `sprite_sheet` | 여러 묶음이 든 시트. JSON 만 읽어 주고 프레임은 쓰는 쪽이 필요할 때 받는다 |

## 파일명 봉인

배경은 이미지 한 장과 사이드카 JSON 한 쌍으로만 뜻이 통한다. 파일명이 늘 같으면
브라우저·CDN 이 한쪽만 새로 받고 다른 쪽은 캐시에서 꺼내 쓰는 일이 생기고,
그러면 코드도 데이터도 멀쩡한데 화면만 어긋난다.

그래서 배경·시트의 파일명에는 내용 해시가 들어간다. 내용이 바뀌면 주소가 바뀌므로
낡은 캐시가 새 짝과 만날 수 없다. 사이드카에는 짝이 되는 이미지의 sha256 이 함께 적혀 있어,
그래도 어긋나면 화면이 조용히 폴백하지 않고 오류로 알린다.

```
python3 tools/seal/seal_assets.py        # 파일명 봉인 + 매니페스트 경로 갱신
```

굽는 스크립트(`tools/bake/render_iso_scene.py`)는 끝에서 이 봉인을 자동으로 부른다.
옛 파일은 지우지 않는다 — 이미 그 주소를 캐시한 브라우저가 404 를 만나면 안 되기 때문이다.

프리렌더 에셋은 `tools/bake/` 의 빌드 스크립트로 만든다(Blender `bpy`). 앱 실행에는 Blender 가 필요 없다.

```
python3 -m pip install bpy pillow numpy
python3 tools/bake/render_iso_scene.py   # 아이소 배경 + 차량·도시 스프라이트 (끝에서 봉인까지)
python3 tools/bake/render_kit_topview.py # 교구 탑뷰 16방향 + 그림자
python3 tools/bake/make_track_textures.py# 교실 바닥 / 라인테이프 / 마커 / 조명 오버레이
```

## 폴더

- `sprites/` 차량 등 개체 스프라이트
- `track/` 노면 텍스처
- `ui/` 계기판·프레임 등 UI 이미지
