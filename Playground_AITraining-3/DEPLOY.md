# AWS 배포 요약

> 자세한 인계서는 별도 docx 문서(`EDUINO-ML-INT-001_AWS_통합_인계서.docx`) 참조.
> 본 파일은 핵심 사항만 담은 공개용 요약이다.

## 통합 방식

기존 **eduino-web-tutor** (AWS 배포)에 정적 라우트로 추가한다. 서버 ML 코드·추가 인프라 없음.

```
eduino-web-tutor/
├── main.py
└── ml-trainer/index.html   ← 본 repo의 index.html 복사
```

```python
# main.py
from fastapi.staticfiles import StaticFiles

app.mount("/ml-trainer", StaticFiles(directory="ml-trainer", html=True), name="ml-trainer")
```

접속: `https://<도메인>/ml-trainer/`

## 필수 요건

| 항목 | 요구 |
|---|---|
| **HTTPS** | 필수 (카메라 API 조건) |
| 외부 인터넷 | TF.js · MobileNet CDN |
| 서버 자원 | 추가 없음 (학습·추론이 클라이언트에서 수행) |

⚠ HTTP로 서빙하면 카메라가 켜지지 않아 동작 불가.

## 배포 후 검증

1. `https://<도메인>/ml-trainer/` 접속
2. 우상단 상태가 **"준비 완료"** 로 변경
3. 카메라 권한 허용 → 클래스 2개에 각 20장 촬영 → 학습 → 추론 확인

## 데이터 / 개인정보

학습 이미지와 모델은 **사용자 브라우저 메모리에만** 존재한다. 서버로 어떤 데이터도 전송되지 않으며, 새로고침 시 소실된다.

---
문의: 권정혁 · 에듀이노 연구소장
