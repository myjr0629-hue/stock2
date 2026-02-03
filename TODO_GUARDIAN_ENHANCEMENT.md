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
- [ ] VIX Term Structure 추가
- [ ] Bond Flow 추가  
- [ ] Gold Flow 추가
- [ ] 반도체 섹터 (SMH) 추가
- [ ] 사이버보안 섹터 (HACK) 추가
- [ ] 클린에너지 섹터 (ICLN) 추가
- [ ] RLSI 가중치 재조정
- [ ] 테스트 및 검증
