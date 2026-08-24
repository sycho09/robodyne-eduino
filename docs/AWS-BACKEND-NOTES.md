# VISION AI · AWS 백엔드 전환 인수인계 노트

> 목적: 현재 **브라우저 localStorage 전용**으로 동작하는 VISION AI 학습 플랫폼을
> AWS 기반 멀티-디바이스 백엔드로 옮길 때 필요한 데이터 모델 · API · 마이그레이션을 정리.
> (작성 시점 기준 구현 = 같은 브라우저 단일 기기 가정)

---

## 1. 현재 클라이언트 저장 구조 (localStorage / sessionStorage)

모든 상태는 `stages/session.js`, `stages/submit.js`, `stages/board.js` 가 직접 읽고 씀.

| 키 | 저장소 | 형태 | 설명 |
|---|---|---|---|
| `vision_classes` | localStorage | `Class[]` | 교사가 개설한 수업 목록 |
| `vision_missions` | localStorage | `Mission[]` | 수업별 미션(교사 생성) |
| `vision_submissions` | localStorage | `Submission[]` | 학생 제출물(이미지 포함) |
| `vision_recent_joins` | localStorage | `RecentJoin[]` | 학생 최근 참여 수업(재입장용) |
| `vision_student_name` | localStorage | `string` | 마지막 제출 학생 이름(‘내 현황’ 필터 키) |
| `vision_session` | sessionStorage | `Mode` | 현재 진입 모드(역할) |
| `vos_pass` | sessionStorage | `'1'` | 진입 토큰(역할 선택 1회 통과) |

### 타입 (현행)
```ts
Class       = { code, name, capacity:number, createdAt:ISO }
Mission     = { id, classCode, className, title, content, createdAt:ISO }
Submission  = { id, feature, label, name, klass, classCode, className,
                missionId, missionTitle, note, summary:string[],
                img:dataURL,                      // ← base64 이미지(용량 큼)
                time:ISO, status:'제출됨'|'평가완료', score, result:'pass'|'redo'|null, feedback }
RecentJoin  = { code, name, className, at:ISO }
Mode        = { mode:'free'|'teach'|'class', code?, name?, student? }
```

### 식별 한계 (백엔드에서 반드시 해결할 것)
- **학생 본인 식별이 "이름 문자열"** 기반. 동명이인 충돌 가능 → 서버에선 `studentId` 발급 필요.
- **수업 코드 조회가 localStorage 한정**. 교사 기기에서 만든 수업이 학생 기기에 없으면 첫 참여 불가.
  → 서버에 수업 레지스트리를 두면 해결(코드로 전역 조회).
- **이미지가 base64 dataURL로 제출물에 인라인** → localStorage 용량 압박. 서버에선 S3 업로드 + URL 참조로 분리.

---

## 2. 목표 서버 데이터 모델 (제안)

```
Class      { classId(PK), code(unique,index), name, capacity, ownerId(teacher),
             status:'active'|'ended', createdAt, endedAt }
Mission    { missionId(PK), classId(FK,index), title, content, order, createdAt }
Enrollment { enrollId(PK), classId(FK), studentId, displayName, joinedAt }   # 참여 명단
Submission { submissionId(PK), classId(FK,index), missionId(FK), studentId,
             displayName, feature, label, imageKey(S3), note, summary[],
             status, result, score, feedback, createdAt, evaluatedAt, evaluatedBy }
```
- 이미지: 클라이언트가 **presigned PUT**으로 S3 업로드 → `imageKey`만 DB에 저장. 조회는 presigned GET.

---

## 3. 필요한 API (REST 예시)

| 메서드 | 경로 | 역할 | 비고 |
|---|---|---|---|
| POST | `/classes` | 교사 | 수업 개설, code 발급 |
| GET | `/classes/:code` | 공통 | 코드로 수업 조회(학생 첫 참여 핵심) |
| GET | `/classes?owner=me` | 교사 | 내가 만든 수업(이어서 운영) |
| PATCH | `/classes/:id` | 교사/관리자 | 종료(status=ended) 등 |
| DELETE | `/classes/:id` | 관리자 | 수업+미션+제출 정리(현재 관리자모드 기능의 서버판) |
| POST | `/classes/:id/missions` | 교사 | 미션 생성 |
| GET | `/classes/:id/missions` | 공통 | 미션 목록 |
| POST | `/classes/:id/enroll` | 학생 | 참여(명단 등록) |
| POST | `/uploads/presign` | 학생 | S3 업로드 URL |
| POST | `/classes/:id/submissions` | 학생 | 제출(imageKey 참조) |
| GET | `/classes/:id/submissions` | 교사 | 전체 제출(평가용) |
| GET | `/classes/:id/submissions?me=1` | 학생 | 본인 제출만(‘내 현황’) ← **권한 분리 서버 강제** |
| PATCH | `/submissions/:id` | 교사 | 평가(result/feedback) |
| GET | `/admin/overview` | 관리자 | 전체 수업/제출/완료 현황 |

### 권한 규칙 (지금 클라에서 UI로만 막은 것 → 서버에서 강제)
- 학생: 본인 제출 **조회만**. 평가 PATCH 금지.
- 교사: 자기 수업 제출 조회/평가.
- 관리자: 전체 조회 + 삭제 + 수업 종료.

---

## 4. 인증/실시간
- **인증**: Cognito(교사/관리자 계정) + 학생은 코드+이름 경량 세션(익명 토큰) 또는 일회용 enroll 토큰.
- **실시간(선택)**: 교사 게시판 자동 갱신 → AppSync(GraphQL subscription) 또는 API Gateway WebSocket. 없으면 폴링으로 시작 가능.
- **추천 스택**: API Gateway + Lambda + DynamoDB(단순/저비용) 또는 RDS(관계형 선호 시) + S3(이미지) + CloudFront.

---

## 5. 클라이언트 ↔ 서버 매핑 (전환 시 교체 지점)
`stages/session.js`의 메서드만 **얇은 API 클라이언트로 교체**하면 화면 코드는 거의 그대로 재사용 가능.

| 현재 함수 | 교체 대상 |
|---|---|
| `Session.createClass` | `POST /classes` |
| `Session.getClass(code)` | `GET /classes/:code` |
| `Session.listClasses()` | `GET /classes?owner=me` |
| `Session.createMission` / `missionsFor` | `/missions` |
| `Session.submissionsFor` | `GET /classes/:id/submissions` |
| `submit.js` 제출 저장 | presign + `POST /submissions` |
| `board.js` 평가 저장 | `PATCH /submissions/:id` |
| `admin.js` 삭제/현황 | `/admin/*`, `DELETE /classes/:id` |

> 설계 원칙: **수업 코드 기반 조회**를 이미 전제로 만들었으므로 서버 이식이 자연스럽다.

---

## 6. 마이그레이션(기존 로컬 데이터 보존)
- 관리자모드 / 게시판에 **내보내기(JSON)** 기능 있음 → 전환 시 이 JSON을 서버 **일괄 임포트 엔드포인트**로 올리면 됨.
- 이미지 base64 → 임포트 시 S3로 풀어서 `imageKey`로 치환.

---

## 7. 보안/운영 메모
- 제출 이미지에 개인정보(학생 얼굴 등) 포함 가능 → S3 비공개 + presigned, 보존기간 정책 필요.
- 수업 종료 시 자동 아카이브/삭제 정책(현재는 관리자가 수동 삭제).
- 관리자모드는 현재 **클라이언트 버튼**일 뿐 인증 없음(같은 브라우저 가정). 서버 전환 시 반드시 관리자 인증 뒤로.
