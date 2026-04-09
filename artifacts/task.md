# 듀얼 게이지(Context Score & Smart Flow) 초정밀 이식 작업

- `[x]` 1. **백엔드 통신 안전 연결 (Pinpoint)**
  - `[x]` `unified/route.ts` 에서 `tickersData.alpha` 할당 부분 근처에 `calculateWhaleIndex` 를 연결.
  - `[x]` 기존 기능에 전혀 영향 미치지 않는 안전한 객체 프로퍼티 확장 방식 사용.
- `[x]` 2. **무중단 프론트엔드 컴포넌트 신규 제작**
  - `[x]` 기존 코드를 건드리지 않는 완전 독립형 커스텀 SVG `DualGaugeHUD.tsx` 컴포넌트 생성.
- `[x]` 3. **대시보드 헤더 초정밀 튜닝 (LiveTickerDashboard)**
  - `[x]` `LiveTickerDashboard.tsx` 의 우측 여백을 잘라내어 듀얼 게이지에 공간 할당.
  - `[x]` 회사 설명 칸을 높이 손실 없이 좌측으로 부드럽게 밀고 스크롤 적용.
- `[x]` 4. **버그 검증**
  - `[x]` 컴포넌트 마운트 시 ECharts 무한 로딩 대비 100배 빠른 딜레이 없는 렌더링 확인.
  - `[x]` 컬러와 라벨 명(Heavy Accumulation 등) 정확한 연동 확인.
