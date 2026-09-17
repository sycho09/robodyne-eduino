# 컨셉 이미지 자리

컨셉 이미지는 이후 별도로 첨부될 예정이다. 도착하면 이 폴더에 넣는다.

1차에서는 **구조와 배치만** 잡았다. 색·타이포는 전부
`src/ui/styles/tokens.css` 의 CSS 변수로 분리되어 있으므로,
컨셉이 확정되면 **그 파일만 교체**하면 된다. 다른 CSS/JS 는 색 값을 직접 쓰지 않는다.

교체 대상 토큰 그룹
- 표면 (`--c-bg`, `--c-surface*`, `--c-line*`)
- 글자 (`--c-text*`)
- 강조 (`--c-accent`, `--c-gauge`, `--c-ok`, `--c-warn`, `--c-danger`)
- 트랙 뷰 (`--c-view-bg`, `--c-track-*`, `--c-car*`, `--c-trail`, `--c-checkpoint`, `--c-finish`)
- 타이포 (`--font-ui`, `--font-mono`, `--fs-*`)
- 간격·형태 (`--sp-*`, `--r-*`)
- 레이아웃 (`--pane-left`, `--pane-right`, `--header-h`)

트랙·차량 그림 자체는 코드가 아니라 `assets/` 의 에셋 슬롯으로 들어온다.
`assets/README.md` 참고.
