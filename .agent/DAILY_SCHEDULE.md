# 하루 3편 편성표 — 실행판

**확정** 2026-08-20 · 근거 [SHORTS_PLAYBOOK.md](SHORTS_PLAYBOOK.md) · [METADATA_BENCHMARK.md](METADATA_BENCHMARK.md)

---

## 1. 슬롯 (KST)

| 시각 | = ET | 실측 | 트랙 | 소재원 | 리드타임 |
|---|---|---|---|---|---|
| **13:00** | 00:00 | **d +0.31 ★★** | **CLOSE** — 전일 미국 마감 해석 | 미국장 마감이 KST 05:00 → 8시간 여유 | 당일 오전 제작 |
| **16:00** | 03:00 | **d +0.31 ★★** | **CONCEPT** — 개념 설명 | **재고에서 꺼낸다** (시의성 없음) | 사전 제작 |
| **19:30** | 06:30 | d −0.03 (중립) | **MORNING** — 미국 프리마켓 | 프리마켓이 ET 04:00 개장 | 당일 저녁 제작 |

### ⛔ 금지 시간대

```
KST 22:00 ~ 01:00  (= ET 09:00~12:00)   d −0.15 · n=578 · 99% 유의
```
지금까지 우리가 가장 많이 쓰던 시간이다. 업로더가 이 시간대 예약을 **거부한다.**

---

## 2. 하루 실행 순서

```
09:00  node scripts/yt-ledger.mjs            전일 성적 원장 갱신
09:10  node scripts/capture-app.mjs AMD      앱 실화면 캡처 (숫자 갱신)
09:20  node scripts/morning-edge.mjs         우위 스캔 — 통과 조건이 그날 소재
       (하나도 없으면 그것도 소재다 — 「N번 세어봤더니 동전던지기」)
09:30  대본 → node scripts/tts-beats.mjs XXX → 렌더 → QC
12:30  node scripts/yt-upload.mjs .agent/plans/YYYY-MM-DD.json --dry
12:40  node scripts/yt-upload.mjs .agent/plans/YYYY-MM-DD.json
────────────────────────────────────────────────────────────────
15:30  CONCEPT 은 재고에서 꺼내 16:00 예약만 건다
17:30  MORNING 제작 시작 → 19:30 예약
```

**업로드는 전부 「비공개 + 예약」이다. 공개 전환(개시)은 대표가 한다.**

---

## 3. 대표가 해야 하는 두 가지 (API 로 안 되는 것)

| 항목 | 왜 | 언제 |
|---|---|---|
| **공개 전환** | 지시대로 개시는 대표가 한다 | 예약 시각 전 또는 스튜디오에서 즉시 |
| **고정 댓글** | 비공개 영상에는 댓글 API 가 **403** 을 낸다(실측). 공개된 뒤라야 달린다 | 공개 후 · 아래 문구를 붙여넣고 「고정」 |

---

## 4. 예약 완료 목록 (2026-08-20 21:55 기준)

| 예약(KST) | 트랙 | 제목 | ID |
|---|---|---|---|
| **08-20 21:55** | MORNING | A $28.7 Billion Buyback. US Chip Stocks Did Not Move. | `KxD2_-_qBdw` |
| **08-21 13:00** | CLOSE | Tesla Rose 4%. AMD Fell Nearly 4%. The Nasdaq Moved 0.2%. | `HD1PYUB34oQ` |
| **08-21 16:00** | CONCEPT | Why Most Options Expire Worthless — Max Pain on AMD (Free) | `DrtxMCj_XIg` |

### 🗑 삭제 필요

`9FRY-rqv_oc` — 위 08-21 13:00 편의 **구버전**이다. 썸네일이 프레임 0 이 아니었고
CTA 목업이 깨져 있었다. 예약을 2027-01-01 로 밀어 자동 공개를 막아 뒀다.
**스튜디오에서 삭제할 것** (API 로는 영구 삭제를 하지 않는다).

### 고정 댓글 (공개 후 붙여넣고 「고정」)

**KxD2_-_qBdw**
```
Korea jumped 3% or more 73 times since 2021. Micron was higher the next day 44% of the time, against 52% on any given day. A buyback is capital return, not chip demand.

FREE options data on any US ticker:
https://www.signumhq.com
```

**HD1PYUB34oQ**
```
We counted 56 days like this since 2021. 61% higher in five days, against 58% on any given day. That is a coin flip.

FREE options data on any US ticker:
https://www.signumhq.com
```

**DrtxMCj_XIg**
```
Full breakdown — max pain, gamma flip, whale flow and dark pool on any US ticker:
https://www.signumhq.com

FREE. No account needed to look.
```

---

## 4-B. ⛔ 이번에 잡은 제작 결함 4개 (재발 방지)

| 결함 | 원인 | 고친 것 |
|---|---|---|
| **아웃트로에 상단 배너가 겹침** | `<Sequence from={hookF}>` 에 `durationInFrames` 가 없어 «끝까지» 그려졌다 | CTA 시작 프레임에서 배너를 내린다 |
| **아웃트로가 나왔다 사라짐** | 루프백이 CTA 를 통째로 덮었다 | 루프백에 «SIGNUM HQ · FREE» 가는 띠를 남긴다. 스토어 배지는 넣지 않는다(루프가 닫힌다) |
| **썸네일이 엉뚱한 비트** | `ffmpeg -ss 0.5` 는 키프레임으로 튄다 | `-vf "select=eq(n\,0)"` 로 **프레임 0 정확히** 뽑는다 |
| **CTA 목업 깨짐** | 폰 하단 잘림 · 칩 4개가 wrap 되어 2개만 보임 · ask 문구가 UI 존 밖 · 뒤 폰이 한국어 앱 | 좌표 전부 고정(안전존 y<1500) · `flexWrap: nowrap` · 뒤 폰을 영어 화면(guardian)으로 |

**규칙: 어떤 영상이든 올리기 전에 «프레임 검수»를 한다** — 훅(프레임 0) · 인사이트 비트 · CTA 3장.

---

## 5. 🔴 병목 — 개념편 재고

하루 3편 = 주 21편. 개념 트랙은 **1편에 1슬롯**을 먹는데 재고가 **1편뿐**이다.

| 상태 | |
|---|---|
| 완성 | 1편 (C1 Max Pain) |
| 목표 | **15편** — 착수 조건 |
| 남은 주제 | 마켓메이커 · 다크풀 · 감마스퀴즈 · 고래플로우 · VWAP · 콜월/풋플로어 · RSI (`CONCEPT_TRACK.md §2`) |

**재고가 차기 전까지 16:00 슬롯은 비운다.** 억지로 채우면 품질이 무너지고,
그게 알고리즘에 「이 채널은 편차가 크다」로 학습된다.

제작 비용은 1편당 **약 40분** (대본 → TTS → 렌더 → QC). 페이오프 숫자만 매일 바뀐다.

---

## 6. 매일 확인 (자동)

```bash
node scripts/yt-ledger.mjs      # 조회·지속률·게시시각 상관 재계산
node scripts/yt-stats.mjs       # 28일 트래픽 소스
```

### 지금 진행 중인 사전등록 검증

| 가설 | 시작 | 판정 |
|---|---|---|
| **게시시각 KST 22~01 → 13~19 이동** | 2026-08-20 | 전/후 조회 중앙값. 각 15편 이상 쌓인 뒤 |
| **길이 52초 완전판 vs 18초 압축판** | 미착수 | 같은 개념 두 길이, 같은 시간대, 하루 간격 |
| 첫컷 2.47초 가설 | 대기 | 09_AMD 지속률 60% 이상이면 지지 |
