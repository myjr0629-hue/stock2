---
name: migrate-check
description: 외부 API 엔드포인트/데이터 소스 교체·마이그레이션 표준 절차 (신구 값 대조 검증 필수). 트리거 — "마이그레이션", "엔드포인트 교체", "선셋", "sunset", "deprecated", "API 바꿔", Massive/Polygon/FMP/Yahoo 엔드포인트 변경, 데이터 소스 전환 일체.
---

# 엔드포인트 마이그레이션 표준 절차 (신구 대조 필수)

> 원칙: 마이그레이션 완료의 정의 = **신구 계산 결과가 같은 숫자**임을 표본으로 증명한 것.
> 구버전이 살아있는 유예 기간이 대조 검증의 골든타임 — 미루면 검증 수단이 사라진다.

## 0. 착수 전
- `git fetch` 동기화 + 다른 머신이 같은 파일 작업 중인지 확인.
- 사용처 전수 탐색: `grep -rn "<구엔드포인트>" src/ scripts/` — **모든** 호출부 목록화 (Vercel 라우트 + Lambda 양쪽 확인. 이 프로젝트는 같은 API를 두 곳에서 부르는 패턴이 흔함).

## 1. 신규 엔드포인트 실측 (문서 신뢰 금지)
```bash
curl -s "<신규URL>?<파라미터>&apiKey=$KEY" | head -c 400
```
확인 항목 (전부):
- [ ] 플랜 접근 가능? ("Restricted Endpoint" 여부)
- [ ] 필요한 필드가 응답에 존재? (필드명 매핑표 작성)
- [ ] 값의 단위/스케일 동일? (달러 원값 vs 천단위 등)
- [ ] **정렬 방향** (Massive 신형은 기본 과거→최신인 경우 있음 — 성장률 부호가 뒤집히는 함정)
- [ ] 파라미터 문법 (`ticker=` vs `tickers=`, 필터 지원 여부 — vX 13-F는 cusip/period 필터를 무시했음)

## 2. 코드 수정
- URL + 필드 경로 + 파라미터만 교체. **계산 로직은 건드리지 않는다** (like-for-like).
- 기존 `.catch(() => null)` 등 그레이스풀 실패 구조 유지.

## 3. 신구 대조 검증 (핵심 — 생략 금지)
표본 10~20종목 (대형+중형+소형 섞어서):
```bash
node -e "— 구엔드포인트 계산값 vs 신엔드포인트 계산값을 종목별 표로 출력 —"
```
- 최종 파생값(예: 성장률%·마진%)끼리 비교. 원시 필드가 아니라 **화면에 나가는 숫자** 기준.
- 불일치 발견 → 중단, 원인 보고 (반올림·기간 어긋남·정렬 문제 순으로 의심).

## 4. 배포
- Vercel 경로: 커밋·푸시. Lambda 경로: `/deploy-lambda` 스킬 절차로.
- 배포 후 프로덕션 실응답으로 최종 확인 (`curl https://www.signumhq.com/api/...`).

## 5. 기록
- 인프라맵에 기록: 구→신 매핑표, 검증 표본 결과, 커밋 해시.
- 구엔드포인트 참조가 코드에 남아있으면 제거 여부를 사용자에게 보고.

## 현재 대기 중인 마이그레이션 (참고)
- **Financials vX → `stocks/financials/v1/income-statements`**: 사용처 2곳 (`scripts/deploy-lambda-v7.js` L959·L981~, `src/app/api/live/fundamentals/route.ts` L53·L75~). 매핑: `financials.income_statement.revenues.value`→`revenue`, `net_income_loss.value`→`consolidated_net_income_loss`. `ticker=`→`tickers=`. 정렬 desc 필수 확인. 플랜 접근 OK 확인됨 (2026-07-07). 영향: FUNDAMENTAL 카드 매출성장·마진 필드.
