# 서드파티 라이선스

> **배포용 사본은 [`public/THIRD-PARTY-LICENSES.txt`](../public/THIRD-PARTY-LICENSES.txt) 다.**
> ISC·MIT 의 조건은 "사본에 고지 포함"인데 `docs/` 는 배포 대상이 아니다.
> `public/` 은 `dist/` 로 그대로 복사되므로 배포 사이트의 `/THIRD-PARTY-LICENSES.txt` 로 접근된다.
> **두 파일을 같이 고칠 것.**

## Lucide Icons

`src/app/icons.js` 의 표준 도형 41종은 Lucide 아이콘의 SVG 경로를 복사한 것이다.
런타임 의존성은 없다 — 경로 문자열만 소스에 들어가 있다.

- 출처: https://lucide.dev (lucide-static v1.29.0)
- 이 제품 고유 개념 6종(robot·board·brain·press·motor·digital)은 직접 그린 것이라 해당 없음

## 웹폰트 — Space Grotesk · Orbitron

SIL Open Font License 1.1. `index.html` 에서 Google Fonts CDN 링크로 불러온다.
**폰트 파일을 재배포하지 않으므로 동봉 의무는 없다.** 셀프호스팅으로 바꾸면 각 폰트의 `OFL.txt` 를 함께 배포해야 한다.

## 그 외

- 이미지·3D 렌더(`public/brand/`) · 펌웨어 · 애플리케이션 코드 — 자체 제작
- 이모지 — 사용자 OS 폰트로 렌더. 재배포 아님
- `sharp` · `vite` — 빌드 도구. 배포물에 포함되지 않는다
- **런타임 npm 의존성 0개**

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
