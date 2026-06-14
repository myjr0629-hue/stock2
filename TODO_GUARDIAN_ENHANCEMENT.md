# Guardian Flow Enhancement Plan

## 목표
Guardian RLSI 정확도 향상 (65-75% → 75-85%)

---

## Part 1: 플로우 항목 추가

### 1순위: VIX Term Structure ⭐⭐⭐⭐⭐
- VIX vs VIX3M 비교
- 콘탱고 = 안정, 백워데이션 = 공포
- **정확도 +5-8%**
- Polygon: `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=VIXY,VXX`

### 2순위: Bond Flow (TLT) ⭐⭐⭐⭐
- 채권 자금 흐름
- 안전자산 선호 감지
- **정확도 +3-5%**
- Polygon: 일반 주식처럼 조회

### 3순위: Gold Flow (GLD) ⭐⭐⭐
- 금 자금 흐름
- 인플레 헷지 심리
- **정확도 +2-3%**
- Polygon: 일반 주식처럼 조회

---

## Part 2: 섹터 추가

### 1순위: 반도체 (SMH) ⭐⭐⭐⭐⭐
- AI 핵심 섹터, XLK와 분리
- 종목: NVDA, AMD, AVGO, QCOM, MU, LRCX, AMAT, KLAC, MRVL, ASML
- `universePolicy.ts`의 SECTOR_MAP에 추가

### 2순위: 사이버보안 (HACK) ⭐⭐⭐⭐
- 성장 테마
- 종목: CRWD, PANW, ZS, FTNT, OKTA

### 3순위: 클린에너지 (ICLN) ⭐⭐⭐
- ESG 트렌드
- 종목: ENPH, SEDG, FSLR, NEE, PLUG

### 4순위: 채권/금 (안전자산) ⭐⭐⭐
- TLT, GLD를 별도 섹터로 추가
- Risk-Off 감지 강화

---

## 구현 위치
- `src/services/guardian/rlsiEngine.ts` - 플로우 항목 추가
- `src/services/universePolicy.ts` - SECTOR_MAP에 섹터 추가
- `src/components/guardian/SmartMoneyMap.tsx` - UI에 새 섹터 노드 추가

## 예상 결과
- 시장 방향 예측: 75-85%
- 극단 상황 감지: 88-92%
- 월 가치: $80-100 → $120-150

## 상태
- [x] VIX Term Structure 추가
- [x] Bond Flow 추가  
- [x] Gold Flow 추가
- [x] 반도체 섹터 (SMH) 추가
- [x] 사이버보안 섹터 (HACK) 추가
- [x] 클린에너지 섹터 (ICLN) 추가
- [x] RLSI 가중치 재조정
- [x] 테스트 및 검증

---

## AWS Activate 크레딧 확장 ($5,120)

### [ ] CloudFront CDN
- 글로벌 속도 개선 (한국/일본 사용자 체감 ↑)
- 정적 자산 + API 응답 엣지 캐싱
- Vercel 부하 분산

### [ ] Bedrock Claude → Flow AI Verdict
- 현재: 룰 기반 `generateConclusion` (IF/ELSE 한계)
- 변경: Bedrock Claude 3.5 Haiku로 지표 심층 분석
- 입력: OPI, 고래, 스마트머니, DEX, GEX, 스퀴즈, IV, UOA, P/C
- 장점: 뉴스 검색 불필요 (순수 지표 분석) → Perplexity보다 적합
- 비용: ~$0.005/건, 월 ~$75 → 크레딧으로 5년+ 가능

### [x] Gemini → Bedrock Claude 전체 전환 ⭐⭐⭐⭐⭐
- **이유**: Gemini API 승인 미획득 → 차단 리스크, Bedrock은 크레딧 차감으로 안정적
- **방향**: 통합 Bedrock 클라이언트 1개 만들어서 모든 AI 호출 일원화 (도구 최소화)
- **전환 대상** (5개 API):
  - `intel/snapshot/route.ts` — M7 뉴스 AI 인사이트
  - `live/news/route.ts` — 실시간 뉴스 분석/번역
  - `intel/cross-sector-brief/route.ts` — 크로스 섹터 분석
  - `guardian/news-digest/route.ts` — 뉴스 다이제스트
  - `guardian/briefing/generate/route.ts` — 모닝 브리핑
- **모델**: Claude 3.5 Sonnet (분석) / Haiku (번역/경량)
- **구현**: `src/services/bedrockClient.ts` 통합 클라이언트 생성

### [ ] Perplexity → Polygon 뉴스 + Bedrock Claude 전환
- **현재**: Perplexity가 웹 검색 + 분석 동시 수행 (별도 API 비용)
- **변경**: Polygon/Massive 뉴스 API (이미 유료 구독, 실시간, Benzinga급) → Bedrock Claude 분석
- **전환 대상**: `intel/perplexity-analysis/route.ts` — 세션 그리드 종목 분석
- **장점**: 뉴스 소스 품질↑ (검증된 금융 전문), 분석 품질↑ (Claude), 비용 크레딧 차감
- **참고**: 테스트 후 전환 — Perplexity를 폴백으로 유지

---

## 로딩/UX 성능 최적화 (사용자 경험 최우선)

### [ ] CloudFront + ElastiCache 업그레이드
- CloudFront CDN으로 글로벌 엣지 캐싱 (한국/일본 체감 ↑)
- ElastiCache t3.micro → t3.small (Redis 응답 속도 ↑)
- Lambda@Edge로 API 응답 엣지 캐싱

### [ ] Command 페이지 로딩 최적화
- SSR 데이터 병렬 fetching 강화 (순차 → 동시)
- 카드 스켈레톤 최적화 — 데이터 도착 순서대로 즉시 표시
- SWR prefetch — 종목 전환 시 즉시 표시

### [ ] 페이지 전환 속도 개선
- React Server Components 확대 — 클라이언트 JS 번들 ↓
- next/link prefetch 적극 활용
- 이미지/폰트 최적화 (LCP 개선)

---

## UX 체감 개선

### [ ] 티커 검색 즉시 자동완성
- Redis에 전체 종목 목록 캐시 → 입력 즉시 결과 (0ms)

### [ ] 모바일 반응형 최적화
- Command/Flow 페이지 모바일 레이아웃
- 터치 인터랙션, 카드 스택 구조

### [ ] Command 카드 독립 로딩
- unified API 대기 없이 독립 카드 먼저 렌더링
- 데이터 도착 순서대로 즉시 표시

### [ ] 페이지 전환 깜빡임 제거
- SWR prefetch + 트랜지션 애니메이션
- 종목 전환 시 앱처럼 부드럽게

### [ ] 차트 인터랙션 강화
- 드래그 줌, 크로스헤어, 지표 오버레이
- 트레이딩뷰 느낌의 프리미엄 차트

---

## 런칭 시 구현

### [ ] 알림 시스템 (SNS + SQS + Lambda)
- 가격/GEX 급변/스퀴즈 발생 시 푸시 알림
- 사용자별 알림 설정

### [ ] EC2 WebSocket Hub 업그레이드
- t3.micro → t3.small (RAM 1GB→2GB, 동시 접속 50→200+)
- 런칭 후 사용자 증가 대비 필수

### [ ] AWS WAF (보안 방화벽)
- DDoS 방어, 악성 봇 차단, API Rate Limiting
- 런칭 전 보안 필수 요소

---

## 코드 정리

### [ ] "Alpha Score" → "Context Score" UI 라벨 변경
- **범위**: 사용자에게 보이는 텍스트만 변경 (엔진 내부 변수명 유지)
- **대상 파일**:
  - `CardTooltip.tsx`, `DashboardClient.tsx`, `ScoreXRayPanel.tsx`
  - `TacticalReportDeck.tsx`, `CardCustomize.tsx`
  - `explanationLibrary.ts`, `how-it-works` 페이지들

---

## 추가 구현 (우선순위 최하위)

### [ ] Command 지표 히스토리 타임라인
- 현재: GEX 외 지표는 현재 스냅샷만 표시
- 변경: PCR, 스퀴즈, IV Skew 등 변화 추이 타임라인 추가
- DynamoDB `signum-alpha-history`에 데이터 이미 축적 중 → UI만 구현
