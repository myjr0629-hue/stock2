# Pinterest 실행 정본 (2026-09-02)

> **Pinterest 는 SNS 가 아니라 검색엔진이다.** 팔로워 2명으로 월 6,318 조회가
> 나오는 이유이고, 핀은 한 번 올리면 계속 검색에 잡힌다(수명이 길다).

## ★★ 대표 지적으로 찾은 것 — Pinterest 의 주식 청중은 우리가 생각한 사람이 아니다

Pinterest 검색 상단 필터 = **그 안에서 실제로 붙여 검색되는 말**이다. 실측:

| 검색어 | Pinterest 가 붙이는 필터 |
|---|---|
| `stock market` | **Aesthetic** · Wallpaper · Graph · **Chart** · Video · **Beginners** · Quotes · Indian |
| `investing` | **Aesthetic** · Money · Banking · Pictures · **App** · Banking aesthetic · Banker |
| `trading` | **Aesthetic** · Wallpaper · Forex · **Charts** · **Setup** · Day · Video |

**세 검색어 모두 1순위가 `Aesthetic`.** 옵션 플로우도 다크풀도 없다.
Pinterest 주식 청중은 **차트·미학·초보 교육·앱 추천**을 찾는다.
`investing` 에는 **`App` 필터**까지 있다 — 앱을 찾는 사람이 모여 있다는 뜻이다.

**우리 다크 네온 데이터 카드가 정확히 「trading aesthetic」이다.**
형식은 이미 맞았는데 **제목을 전문가 용어로 달아서** 이 수요를 못 받고 있었다.

## 제목·설명 쓰는 법

❌ `TSLA options positioning — max pain, gamma flip, premium`
✅ `NVDA stock chart today — free investing app for beginners, no signup`
✅ `S&P 500 chart today — free stock market app for beginners`

- **제목**에 Pinterest 수요어를 넣는다: `stock chart` · `stock market app` ·
  `for beginners` · `free` · `no signup` · `trading setup`
- **설명**은 800자. 실데이터 숫자 + 앱 주소 + 해시태그
  `#stockmarket #investing #tradingaesthetic #stockchart #investingforbeginners`
- **랜딩 링크**에 `?from=pinterest_<티커>` — 프로필 웹사이트 칸과 달리 **여기선 태그가 안 잘린다**

## 카드 만들기

```bash
node scripts/make-x-shot.js signum en flow NVDA
# → ~/Desktop/X 댓글용 이미지/YYYY-MM-DD-signum-flow-en-NVDA.png
# 업로드하려면 scratchpad 로 복사 (Desktop 은 세션 읽기권한 밖)
```

## 핀 올리는 절차 (브라우저 · 이 순서를 지킬 것)

1. `pinterest.com/pin-builder/` 로 이동 (매번 새로 — 재사용하면 에디터가 깨진다)
2. `find` 로 file input → `file_upload`
3. **6초 대기** 후 설명 영역 `(823, 400)` 클릭 → 포커스
4. JS 한 번에: `execCommand('insertText')` 로 설명 → 네이티브 setter 로 제목·링크
5. `게시` 클릭 `(1004, 184)`

**함정:**
- 일반 타이핑은 글자를 흘린다 → JS 로만 넣는다
- 게시 후 같은 화면을 재사용하면 **설명 에디터가 사라진다** → 매번 새로 연다
- 설명은 «포커스된 상태»에서 `execCommand` 로만 들어간다

## 실적 (핀당 30일)

첫 핀 실측: 노출 158 · 클릭 2 · 저장 1.
핀 40개로 월 6,318 조회 → **핀 1개당 월 ~158 노출**. 선형으로 쌓인다.

## 오늘 올린 것 (2026-09-02)

| 티커 | 제목 | from 태그 |
|---|---|---|
| TSLA | (구형 제목 — 전문어) | `pinterest_pin` |
| NVDA | NVDA stock chart today — free investing app for beginners | `pinterest_nvda` |
| SPY | S&P 500 chart today — free stock market app for beginners | `pinterest_spy` |
