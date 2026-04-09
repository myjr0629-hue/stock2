# [SIGNUM HQ] 대시보드 듀얼 게이지 HUD 리빌딩 설계도

이 설계도는 `LiveTickerDashboard.tsx`의 최상단 공간 효율을 극대화하고, 기관 터미널 수준의 "Context Score" 및 "Smart Flow" 계기판을 브라우저 로딩 영향 0%(Zero-Latency)로 이식하는 수술 계획입니다.

## User Review Required

> [!IMPORTANT]
> **성능 최적화 (Zero Dependency SVG)**
> 외부 차트 라이브러리(ECharts 등)를 단 1KB도 사용하지 않고 **순수 SVG 태그 수학 계산**만으로 반원형 계기판을 만듭니다. ECharts 특유의 깜빡임이나 로딩 지연이 완벽히 사라집니다.

> [!TIP]
> **데이터 산출 방식 (컴플라이언스 & 아키텍처)**
> `Context Score`: 기존 API에서 넘어오는 `tickerData.alpha.score` 값을 그대로 사용합니다.
> `Smart Flow`: 기존의 `whaleIndex` 백엔드 로직에 착안하여, 클라이언트에서 이미 들고 있는 실시간 `GEX, 다크풀, 블록딜, 넷프리미엄` 데이터를 더블링 계산(Math)하여 백엔드 통신 없이 즉시 0~100 스코어를 렌더링합니다.

## Proposed Changes

---

### UI Core Components

HUD 게이지 자체를 하나의 독립된 커스텀 컴포넌트로 만들어 기존 코드의 복잡성을 낮춥니다.

#### [NEW] [DualGaugeHUD.tsx](file:///c:/Users/seamo/backup/stock2/src/components/ui/DualGaugeHUD.tsx)
- 순수 SVG(경로 수식 `strokeDasharray`)만을 이용한 기하학적 듀얼 반원(Semi-Circle) 컴포넌트 신규 생성
- **Context Score (좌측)**: 고요하고 안정적인 스페이스 그레이/블루 계열 색상의 게이지
- **Smart Flow (우측)**: 0~100 수치에 따라 `HEAVY DISTRIBUTION`(크림슨 레드) 부터 `HEAVY ACCUMULATION`(에메랄드) 까지 컬러가 동적으로 변하는 파가니 시스템 계기판

#### [MODIFY] [LiveTickerDashboard.tsx](file:///c:/Users/seamo/backup/stock2/src/components/LiveTickerDashboard.tsx)
1. **회사 설명(Description) 공간 압축**:
   - 우측을 넓게 차지하던 레이아웃을 폐기.
   - 틱커(Ticker) 로고 바로 우측(중앙)으로 위치를 이동시키고, `line-clamp-2` 와 `custom-scrollbar` (극도로 얇은 크리스탈 스크롤) 적용. 공간 낭비를 최소화.
2. **듀얼 게이지 인젝션**:
   - 비워진 우측 레이아웃(약 25% 비율)에 새롭게 만든 `<DualGaugeHUD />` 컴포넌트를 주입.
   - 이미 SWR 캐시에 담겨있는 실시간 `tickerData` 구조체를 통째로 HUD에 넘겨주어, 게이지가 장중(PRE~POST) 데이터에 반응하여 펄떡이게 만듦.

## Open Questions

> [!WARNING]
> 현재 UI의 다크모드 무드와 정확히 맞추기 위해 듀얼 게이지의 스케일(크기)을 너무 크지 않게, 블룸버그 터미널처럼 '샤프하고 날카로운' 텍스트/크기로 깎아낼 예정입니다. 이 방향성에 이의가 없으신지 확인 부탁드립니다.

## Verification Plan

### Automated Tests
- 없음 (순수 프론트엔드 비주얼 컴포넌트 이식이므로 유닛 테스트 생략)

### Manual Verification
- Vercel Dev 렌더를 띄워 **초기 0.1초 로딩 시 게이지의 버벅임이 없는지(CLS 이슈 확인)** 점검.
- 장중 Data (PRE ~ POST) 변화 시, Smart Flow 게이지 바늘과 색상이 `HEAVY ACCUMULATION`, `NEUTRAL` 등으로 실시간(Real-time) 즉시 색이 변하는지 육안 확인.
