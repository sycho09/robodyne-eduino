# Challenge Digital Twin

챌린지 게시판용 디지털트윈. 학생이 `.ino` 서브셋 코드를 쓰면 브라우저 안의 결정론 시뮬레이터가
2휠 RC카를 코스 위에서 달리게 하고, 랩타임·이탈·위반을 엔진이 직접 센다.
빌드 도구가 없다 — 순수 ES module 과 정적 파일뿐이라 `index.html` 을 정적 서버로 열면 그대로 돈다.

## 폴더

```
index.html
src/
  engine/       결정론 루프 · 물리 · 트랙 판정 · 규칙 (난수와 실시간 시계를 쓰지 않는 구역)
  runtime/      .ino 서브셋 lexer → parser → validate → transpile → 실행
  challenges/   챌린지 매니페스트 JSON + 스키마 + 로더 · index.json 이 목록을 소유
  kits/         교구 물리 스펙
  ui/           화면 (에디터 / 트랙 뷰 / 계기판 / 카메라 뷰)
assets/         에셋 슬롯. assets.manifest.json 이 슬롯 id → 파일 경로를 혼자 소유한다
tools/
  bake/         에셋을 굽는다 (Blender bpy). 앱 실행에는 필요 없다
  seal/         구운 파일 이름에 내용 해시를 박는다
  checks/       회귀 검사 14종 + 그 기준값
docs/           지금 유효한 문서 (아래 표)
```

`assets/` 안의 파일은 네 갈래다. **지우면 안 되는 것과 다시 구우면 되는 것이 갈린다.**

| 갈래 | 예 | 지워도 되는가 |
| --- | --- | --- |
| 배포가 읽는 봉인본 | `iso-smartcity.94229ca70b.json` | 아니다. 지금 화면이 이것을 읽는다 |
| 지난 차수 봉인본 | `iso-smartcity.df4fc01a51.json` | 아니다. 그 주소를 캐시한 옛 배포본이 404 를 만난다 |
| 봉인 전 원본 | `iso-smartcity.json` · `iso/0000.png` | 지우지 않는다. 굽기 스크립트가 이 경로에 쓰고 봉인이 여기서 읽는다 |
| 짝 없는 옛 파일 | `kits/esp32cam-2wd/iso/000.png` (아이소가 16방향이던 시절) | 지금은 두고 있다. 지우려면 근거를 먼저 세운다 |

폴더마다 무엇이 몇 개씩 섞여 있고 무엇을 지우면 안 되는지는 그 폴더의 README 가 적는다 —
`assets/tracks/classroom` · `assets/kits/esp32cam-2wd` · `assets/sprites/city-iso`.

## 명령

```bash
# 띄우기 — file:// 로 열면 ES module 이 막힌다. 반드시 정적 서버로 연다
python3 -m http.server 8000        # http://localhost:8000
# RC카를 붙일 때는 이 주소(http://localhost)로 열어야 한다. https 로 열면 브라우저가
# http 인 RC카를 막는다(Mixed Content). 화면이 그 사실을 한 줄로 알려 주기는 한다.

# 검사 돌리기 — 14종 전부. 하나라도 실패하면 종료 코드 1
node tools/checks/run-all.mjs
node tools/checks/run-all.mjs 렌더 콜드   # 이름으로 골라서

# 에셋 굽기 (Blender bpy 필요. 앱 실행에는 필요 없다)
python3 -m pip install bpy pillow numpy
python3 tools/bake/render_iso_scene.py     # 아이소 배경 + 차량·도시 스프라이트 (끝에서 봉인까지 부른다)
python3 tools/bake/render_kit_topview.py   # 교구 탑뷰 16방향 + 그림자
python3 tools/bake/make_track_textures.py  # 바닥 / 라인테이프 / 마커 / 조명 오버레이

# 봉인하기 — 파일명에 내용 해시를 박고 매니페스트 경로를 갱신한다
python3 tools/seal/seal_assets.py
```

배포는 `main` 하나다. main 에 푸시하면 Vercel Production 배포가 새로 만들어진다.

## 지금 유효한 문서

| 문서 | 무엇을 맡는가 |
| --- | --- |
| `docs/REGRESSION.md` | 검사 14종. 무엇을 언제 돌리고 무엇이 실패인지, 기준값을 언제 다시 적는지 |
| `docs/RC-CAR.md` | 지금 있는 계열과 챌린지, 그 규칙과 목표값, 남은 백로그 |
| `docs/API-COMPATIBILITY.md` | 학생이 쓸 수 있는 API 규격. 시뮬과 실물 교구에서 같게 동작하는 범위 |
| `assets/README.md` | 에셋 슬롯 규약 · 슬롯 종류 · 파일명 봉인 |

설계 원칙과 규칙 본문은 이 문서들이 소유한다. README 는 어디를 볼지만 가리킨다.
