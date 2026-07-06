---
name: engine-audit
description: XS 엔진(signum-xs)·알파스코어·Context Score 상태 점검과 성과 판정 표준 절차. 트리거 — "엔진 점검", "XS 상태", "IC 확인", "스코어 성과", "V8 vs XS", "맞대결", "튜닝 상태", "알파스코어 어때", 주간 점검, 엔진 관련 보고 요청 일체.
---

# XS 엔진 점검·판정 표준 절차

> 배경 필독: `.agent/INFRASTRUCTURE_MAP.md` §42 (특히 §42.3 검증 헌법, §42.6 아키텍처).
> XS는 **그림자 모드** — UI의 Context Score는 V8 그대로다. UI 전환은 사용자 승인 후에만.

## 1. 리포트 조회
```bash
# 최신 리포트 (매 평일 22:10 UTC 자동 갱신)
node -e "require('dotenv').config({path:'.env.local',quiet:true});
(async()=>{const u=(process.env.UPSTASH_REDIS_REST_URL||'').trim(),t=(process.env.UPSTASH_REDIS_REST_TOKEN||'').trim();
const r=await fetch(u+'/get/cache:xs:report',{headers:{Authorization:'Bearer '+t}});
const j=await r.json();console.log(JSON.stringify(JSON.parse(j.result),null,1));})();"
```
- 과거 이력: DynamoDB `signum-xs-history`에서 `ticker='_REPORT_'` 날짜별 Query.
- 리포트가 이틀 이상 갱신 안 됐으면 → Lambda 실패 의심 → CloudWatch 로그 확인 후 보고.

## 2. 읽는 법
| 필드 | 의미 |
|------|------|
| `dayIC` | 그날 라벨된 T+3의 크로스섹션 Spearman IC (시장조정) |
| `rollingIC.<factor>` | 팩터별 롤링 평균 IC — **가중치의 근거** |
| `weights` | 현재 적용 가중치 (프라이어⊕실측 자동 블렌딩) |
| `calibration` | 데실→실측 시장조정 3D알파·적중률 — **"절대 스코어"의 실체** |
| `labeled` | 그날 라벨 표본 수 (40 미만이면 그날 IC 무효) |

## 3. 판정 기준 (임의 해석 금지 — 이 표대로)
| 상태 | 기준 | 조치 |
|------|------|------|
| 🟢 순항 | 롤링 컴포지트 IC ≥ +0.03 (라벨 15일+) | 유지 |
| 🟡 관찰 | 0 ~ +0.03 | 유지 (팩터별 IC 확인, 죽은 팩터는 가중치가 자동 감쇠 중인지 확인) |
| 🔴 경보 | IC < 0 이 10라벨일+ 지속 | 원인 조사 보고 (임의 튜닝 금지) |
| ⚔️ 맞대결 판정 | 라벨 20일+ 축적 시 | XS 롤링 IC vs V8 동기간 IC 비교표 작성 → 사용자에게 UI 전환 여부 보고 |

- V8 비교치 산출: `signum-alpha-history`에서 같은 기간 alphaScore로 동일 방법론(일별 크로스섹션 Spearman vs T+3 시장조정) 계산. 방법론은 `.agent/CONTEXT_SCORE_DEEP_RESEARCH_2026-07.md` §3 그대로.

## 4. 보고 양식 (고정)
```
XS 엔진 점검 (날짜)
- 가동: 정상/이상 (최근 리포트 날짜, scored 종목 수)
- 컴포지트 IC: 롤링 X (라벨 N일) → 판정 🟢/🟡/🔴
- 팩터 상위/하위: (rollingIC 순)
- 보정 테이블: 상위 데실 adjF3 X% / 적중 Y% (일수)
- 다음 마일스톤: (예: 맞대결까지 라벨 N일 남음)
```

## 절대 금지
- **인샘플 수치로 튜닝/배포 결정** — §42.3 검증 헌법. 어떤 개선이든 그림자 병행 기록으로 실측 우위 확인 후.
- 프라이어·가중치 로직 수동 수정 (IC-적응이 하는 일). 새 팩터 추가는 prior 0으로 시작해 IC로 증명.
- 사용자 승인 없는 UI 노출.
