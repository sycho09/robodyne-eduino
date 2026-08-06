# EDDIE 공식 캐릭터 스펙 & 생성 프롬프트

> 이 문서는 EDDIE 마스코트의 **단일 기준(Single Source of Truth)** 정의서다.
> 새 원본 1장을 여기 스펙대로 생성 → `eddie-hero` 로 확정 → 이후 모든 포즈/코스튬/
> 방향 에셋은 *이 원본을 기준으로* 파생한다(`docs/EDDIE-rig-quickstart.md`,
> `docs/EDDIE-mascot-pipeline.md` 참고).

---

## 1. 디자인 DNA (확정 스타일 — 절대 변경 금지)

EDDIE = **치비(super-deformed) 비율의 귀여운 노란 로봇**. 큰 TV 머리 + 짤뚱한 몸(약
2.5등신). 노란 패널 사이사이 **검은 주름(아코디언) 관절**, TV 머리에 **시안 발광 눈 +
점선 미소**, 안테나 끝에 **반짝이는 시안 별**.

| 부위 | 색 (HEX) / 특징 |
|---|---|
| 보디 옐로우(메인) | `#fbb724` / 음영 `#e0a800` `#cf8f12` / 하이라이트 `#ffe680` |
| 관절(주름) | **짙은 차콜/블랙 아코디언 조인트** (목·어깨·팔꿈치·허리·무릎), 손=어두운 3손가락 |
| 머리 스크린(얼굴) | 짙은 남청 `#0e1d2c` `#0b1620` |
| 눈(발광) | 큰 타원 시안 `#46e8ce` 코어 `#c2fff2` |
| 입 | **점선(작은 시안 닷)으로 만든 미소** |
| 안테나 | 얇은 대(stem) + 끝에 **빛나는 시안 별/스파크** |
| 베젤·볼트귀 | 두꺼운 노란 베젤 + 머리 양옆 작은 볼트 |

비율: **치비 2.5등신**(머리 큼). 렌더: 소프트 3D(Pixar/Blender 톤), 둥글둥글, 부드러운
스튜디오 라이트, 투명 배경.

> 기준 레퍼런스: `EDDIE MASCOT POSE SHEET`(사용자 제공). 모든 신규 에셋은 이 시트를
> 레퍼런스로 첨부해 같은 캐릭터를 유지한다.

---

## 2. 생성 프롬프트 (확정 스타일)

### ▶ 마스터 프롬프트 (붙여넣기용, 영문)

```
A cute chibi mascot robot named EDDIE, soft 3D render (Pixar/Blender style), smooth
rounded glossy forms, soft studio lighting, fully transparent background.

Proportions: chibi / super-deformed — oversized head, short stubby body, about 2.5
heads tall.

Design: matte YELLOW body panels (#fbb724) connected by dark charcoal segmented
accordion rubber joints (ribbed black joints at neck, shoulders, elbows, waist and
knees), dark three-finger hands. Head is a rounded vintage TV/CRT with a thick yellow
bezel and a dark screen face showing two large glowing CYAN oval eyes (#46e8ce, bright
core #c2fff2) and a cute smile drawn as a dotted line of small cyan dots. A thin
antenna on top with a glowing cyan sparkle/star tip. Small bolt ears on the sides.

Front view, symmetrical, standing relaxed. Soft contact shadow only. Clean crisp
edges, high resolution, centered, full body with margin, transparent PNG.
```

### ▶ 포즈별 추가 문구 (각 1장씩, 풀해상도로)
- **idle / 기본** : `relaxed idle, arms at sides, front view`
- **wave**       : `smiling, one hand raised waving hello, front view`
- **cheer**      : `both arms raised up celebrating, happy curved eyes, front view`
- **dir/up(뒤)** : `seen from behind, back of the TV head and antenna visible, mid-walk`
- **dir/left**   : `side profile facing left, mid-walk stride`
- **dir/right**  : `side profile facing right, mid-walk stride`
- **리그용(T)**  : `T-pose, both arms straight out to the sides, clear gap from body`

### ▶ 네거티브
```
no extra limbs, no asymmetry, not cut off, no text, no watermark, no busy background,
no harsh shadow.
```

---

## 3. 일관성 팁 (가장 중요)
- 쓰는 도구가 **레퍼런스 이미지**를 받으면(제미나이/파이어플라이 등),
  기존 `eddie-hero` 를 함께 첨부하고 *"같은 캐릭터, 같은 색·비율 유지"* 를 명시 →
  드리프트 최소화.
- 마음에 드는 1장을 고르면 그게 **공식 원본**. 앞으로 wave/cheer/코스튬/4방향은
  전부 이 원본을 *편집*하거나 *레퍼런스로* 재생성. **매번 백지에서 새로 뽑지 않는다.**

---

## 4. 만든 뒤 다음 단계
1. 생성한 이미지의 **단색 배경 제거**(Photopea: Magic Wand 로 마젠타 선택 → Delete →
   투명). 가장자리 정리.
2. 1024×1024 정사각, 발끝 하단으로 정렬해 저장 →
   - `public/brand/eddie/eddie-hero.png` (기본 히어로 교체) 그리고
   - 리그 슬라이스로 진행 → `docs/EDDIE-rig-quickstart.md`
3. `npm run assets` → WebP 변환 → commit/push.
