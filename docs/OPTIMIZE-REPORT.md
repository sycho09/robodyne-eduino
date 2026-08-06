# 프로젝트 파일 최적화 리포트

> 작업지시 ①~⑤ 실행 기록. 기준 커밋 `bd1f426` · 되돌림 태그 `pre-optimize` · 작업 브랜치 `optimize/cleanup`

---

## Before (Phase 0 기준 측정)

`npm run build` (vite 5.4.21, 89 modules transformed)

| 산출물 | 크기 | gzip |
|---|---|---|
| `dist/assets/index-*.js` | **1,526.59 kB** | 462.40 kB |
| `dist/assets/index-*.css` | 137.56 kB | 28.50 kB |
| `dist/index.html` | 1.31 kB | 0.78 kB |
| `dist/` 전체(자산 포함) | **5.6 MB** | — |

- ⚠️ 빌드 경고: `Some chunks are larger than 500 kB after minification` — 청크 1개뿐(코드 스플리팅 없음)
- JS 소스 **10,180줄** · 씬 **33개** · `main.css` **2,487줄**
- npm dependencies 4개: `blockly@^11.2.2`, `codemirror@^6.0.0`, `@codemirror/lang-cpp@^6.0.0`, `@codemirror/theme-one-dark@^6.0.0`

---

## After

*(각 Phase 완료 시 갱신)*
