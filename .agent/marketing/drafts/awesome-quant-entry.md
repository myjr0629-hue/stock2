# awesome-quant — «Commercial & Proprietary Services» 등재 초안 (2026-09-27)

대상: https://github.com/wilsonfreitas/awesome-quant (★29.8k) README «## Commercial & Proprietary Services»(81개, 옵션 포지셔닝 서비스 0)

## 규칙(CONTRIBUTING.md 원문 요약)
- 공개 저장소에 «실질 구현»이 없는 상업 서비스 = repository-less → 이 칸에만. 조건: 결제정보 없이 쓰는 **영구 무료 등급**,
  **요금·무료 한도 공개**, **공개 문서·방법론·사용 예**, 추적 파라미터 없는 안정 HTTPS URL, 사실만 쓴 비홍보 설명.
- 체험판·데모·대기명단·유료 전용 = REJECT.

## 우리 쪽 근거(실측 2026-09-27)
- 요금: https://www.signumhq.com/en/pricing — FREE $0(COMMAND 제한·GUARDIAN 미리보기·INTEL M7 1편·60초 갱신·13F 조회) / PRO / ELITE
- 방법론: https://www.signumhq.com/en/learn (max-pain · gamma-exposure · call-wall · put-call-ratio · open-interest · options-flow · dark-pool)
- 데이터: https://github.com/myjr0629-hue/options-market-structure-daily (CC BY 4.0, 사용 예 README)

## 제출 전 막을 것
1. **콜월·풋플로어 정의 불일치** — 설명 문서는 «콜 OI 가 가장 큰 행사가»인데 API 값은 범위·방향 제한이 있다
   (9/27 나스닥 전체 체인 대조: MU 콜월 1100 vs 전체 최대 1000, 풋플로어 900 vs 600 · AVGO 풋플로어 350 vs 360.
   맥스페인은 4종목 모두 일치). 코드 정의를 확인해 문서·데이터셋 필드 설명을 먼저 맞춘다.
2. 데이터셋 토요일 파일(2026-09-19) 정리 · 의회 거래 커버리지 정정이 끝난 뒤 제출.

## 진행(9/27 08:5x)
- 정의 확정(코드): 콜월 (S, 1.2S] · 풋플로어 [0.8S, S) · pinZone = maxPain. 데이터셋 필드 설명 수리 완료, 설명 페이지는 브랜치 fix/learn-call-wall-definition(합치기 대기), README·HF Space 는 브라우저 복귀 시.
- 나스닥 전체 체인 대조 11/12 전 항목 일치(계약 수 포함) — 잘림 없음.

## 항목 문안(초안)
- [SIGNUM HQ](https://www.signumhq.com) - `Data` - Options positioning for US stocks and ETFs (max pain, net gamma exposure, call wall and put floor, put/call open interest) plus FINRA off-exchange volume share, in a web and iOS/Android app with a permanent free tier that needs no payment information; daily CC BY 4.0 JSON snapshots for 12 large caps are published on GitHub. [GitHub](https://github.com/myjr0629-hue/options-market-structure-daily)
