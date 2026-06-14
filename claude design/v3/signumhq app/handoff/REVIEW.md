# SIGNUM HQ 모바일 앱 — 디자인 감사 & 강화 패키지

> 검토 대상: `src/styles/app-tokens.css`, `app-view.css`, `src/app/[locale]/app-view/cmd/*`,
> `src/components/app/ValueWall.*`, `AppBottomNav.*`, `src/components/IVSkewCurve.tsx`
> 강화 시안(인터랙티브): **`SIGNUM HQ — Command v2.html`** (이 패키지와 함께 전달됨)
>
> 적용 파일: `01-app-tokens-additions.css` → `02-cmd-enhancements.css` → `03-ValueWall-v2.module.css` + `04-ValueWall-v2.tsx`

---

## 1. 크리티컬 버그 (디자인 이전에 먼저 수정)

### 1-1. `--f-mono`, `--f-jakarta` 토큰이 정의돼 있지 않음 ⚠️ 최우선
`cmd.module.css` 5곳(636, 707, 803, 831, 837행)과 `cmd/page.tsx` 3곳(326, 977, 978행)에서
`var(--f-mono)` / `var(--f-jakarta)`를 사용하지만, **프로젝트 어디에도 정의가 없습니다** (전체 grep 확인).
`font-family: var(--f-mono)`는 조용히 무효 처리되어 상속 폰트로 폴백 → NBBO 숫자, 서브탭 라벨,
레벨 맵 가격이 전부 일반 Inter로 렌더됩니다. **숫자가 "터미널" 느낌이 안 나는 직접적 원인.**

**수정:** `01-app-tokens-additions.css`의 토큰 블록을 `app-tokens.css`에 병합하고,
JetBrains Mono를 로드하세요 (`next/font` 권장):
```ts
// layout.tsx
import { JetBrains_Mono } from 'next/font/google';
const jbMono = JetBrains_Mono({ subsets: ['latin'], weight: ['500','600','700','800'], variable: '--font-jb' });
```
`--f-jakarta`는 실제로 Plus Jakarta Sans를 쓸 게 아니라면 **Inter로 통일**하고 참조를 제거하는 쪽을 권장.

### 1-2. ValueWall 잠금 상태에서 실데이터가 그대로 fetch·렌더됨
`ValueWall.tsx`의 `.blurred`는 children을 **그대로 마운트**합니다. 잠긴 상태에서도:
- `IVSkewCurve`가 SWR로 `/api/live/options/atm` 호출 + 60초 폴링 + WebSocket 구독 → **API 비용 낭비**
- 프리미엄 수치가 DOM에 평문으로 존재 → 개발자도구로 blur만 끄면 노출 → **수익 모델 우회 가능**

**수정:** 잠금 상태에서는 children 대신 **데모/플레이스홀더 데이터**를 렌더하거나
`<ValueWall locked render={locked => ...}>` 패턴으로 fetch를 차단하세요. `04-ValueWall-v2.tsx` 참고.

### 1-3. 잠금해제 상태가 컴포넌트-로컬
`useState`로만 관리 → Quant 탭에서 광고를 봐도 Holders 탭은 잠김, 페이지 이탈 시 리셋.
"1시간 전체 해제" 약속과 불일치. **수정:** Context + `localStorage`(만료 타임스탬프) 전역 관리.
`04-ValueWall-v2.tsx`에 `useUnlockState()` 훅 포함.

### 1-4. 기타
- `chartTypeToggle`의 `.typeBtn` 높이 ≈ 22px → **44px 터치 타깃 미달** (min-height 32px+ hit-slop 권장)
- `page.tsx` 977행 등 하드코딩 색상 `#c084fc`, `rgba(139,92,246,…)` — 시스템에 없는 보라색.
  연장거래(PRE/POST)는 **amber**가 시스템 의미상 맞습니다 (시안의 PRE-MARKET 배지와 통일)
- parqet 로고 `onError` 시 빈 원만 남음 → 티커 첫 글자 폴백 렌더 권장
- `page.tsx` 1,129줄 — `CandleChart`, `TechnicalGammaMap`, `PremiumContent`를 별도 파일로 분리 권장

---

## 2. 디자인 감사 — "왜 flat하게 느껴지는가"

| # | 증상 | 원인 | 처방 (적용 클래스) |
|---|------|------|--------------------|
| 1 | 모든 카드가 똑같아 보임 | 전 카드 `surface-1` + 동일 border → 위계 없음 | 히어로(가격) 카드만 `surface-2` + `border-strong` + **방향성 radial tint** (상승=green glow). `02 → .p2-card` |
| 2 | 가격이 죽어 있음 | `bigPrice`가 정적 텍스트, sparkBg opacity 0.06은 사실상 안 보임 | **네온 플래시 티커**: 틱마다 450ms green/red 글로우 플래시 + ▲TICK 칩. `02 → .p2-price.flash-*` |
| 3 | 차트가 평면 | 1.5px 단색 라인, 그리드 거의 무채색 | 라인에 **SVG glow 필터**, 영역 그라데이션, **크로스헤어+OHLC 툴팁 칩**(현재 별도 행 → 차트 위 플로팅), VWAP은 텍스트 대신 **칩 라벨** |
| 4 | 탭 전환이 끊김 | active 배경색 스왑만 | **슬라이딩 pill 인디케이터** (range tabs, 서브탭 공통). `02 → .seg`, `.c2-ranges` |
| 5 | 숫자가 고급스럽지 않음 | 1-1 폰트 버그 + tnum 미적용 구간 | JetBrains Mono + `tabular-nums` 전면 적용 |
| 6 | 글로우 부재 | shadow 토큰이 black 계열뿐 | `--glow-cyan/green/red/amber` 토큰 추가, 배지·라인·CTA에 사용 |
| 7 | 모션 이징 단조 | `ease` 일색 | `--ease-spring: cubic-bezier(0.22,1,0.36,1)` 통일 |

## 3. Value Wall v2 — "VIP 게이트" 전략

현재 벽은 "막는 벽"입니다. v2는 **"들어가고 싶은 문"**으로 바꿉니다:

1. **무료 티저 행** (블러 없이 노출): "GAMMA FLIP · 1 OF 6 SIGNALS FREE → $132.50 [FREE PREVIEW]"
   — 데이터 품질을 증명하고, 나머지 5개를 궁금하게 만듦
2. **블러 뒤 숫자가 실시간으로 틱** — 죽은 스크린샷이 아니라 "지금 움직이는 데이터"라는 신호
   (실데이터 아닌 ±4% 노이즈 데모값 — 1-2 보안 이슈 회피)
3. **Conic-gradient 회전 골드 링 락** — 정적 자물쇠 → 살아있는 VIP 배지
4. **CTA 쉬머 스윕** — 금속 광택이 3.2초 주기로 흐름 + 카드 테두리에도 4.5초 주기 골드 스윕
5. **소셜 프루프**: "12,400 unlocked today · or $9.99/mo ad-free"
6. veil 그라데이션을 위 42% / 아래 95%로 — 티저는 보이고 하단 콘텐츠는 확실히 가림

→ `03-ValueWall-v2.module.css` + `04-ValueWall-v2.tsx`로 드롭인 교체.

## 4. 화면별 적용 가이드

- **cmd Overview**: `.priceCard`→`.p2-card`, 가격에 flash 로직(틱 비교 useEffect), RSI/VWAP/RANGE **vitals 미니바 3종** 추가, 서브탭 `.tabBar`→`.seg`
- **cmd Quant (GEX)**: zero-line + **FLIP 수직 마커**(amber glow) + 하단 스트라이크 축 라벨. `02 → .gex2-*`
- **Technical Levels Map**: 마커 dot에 `box-shadow: 0 0 8px currentColor` 이미 있음 — 가격 마커만 **pulse 애니메이션** 추가 권장
- **IVSkewCurve**: 구조 우수 (i18n/WS 스로틀 잘 됨). FEAR/TARGET 어노테이션에 글로우만 추가
- **dash/flow/intel**: 동일 토큰·패턴 재사용 (글로우 토큰, 슬라이딩 pill, mono 숫자)

## 5. 적용 순서 (안티그래비티 체크리스트)

1. [ ] `01` 토큰 블록을 `app-tokens.css` `:root`에 병합 + JetBrains Mono 로드
2. [ ] `--f-jakarta` 참조 제거 또는 정의 추가 (1-1)
3. [ ] `02` 클래스를 `cmd.module.css`에 병합, page.tsx 클래스 교체
4. [ ] ValueWall v2 교체 (`03`+`04`) + 전역 unlock 훅 연결
5. [ ] 잠금 상태 fetch 차단 (1-2)
6. [ ] 하드코딩 보라색 → amber 토큰 (1-4)
7. [ ] 인터랙티브 시안(`SIGNUM HQ — Command v2.html`)과 화면 비교 검수
