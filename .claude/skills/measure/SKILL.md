---
name: measure
description: 전후 실측을 낸다 — 관제 콘솔 기동, 지표 수집, 모델별 토큰·턴·도구 호출·비용 비교표. 「좋아졌나」를 숫자로 답할 때 쓴다.
---
# 실측 절차

1. 콘솔 기동/확인: `bash scripts/hud/start.sh` → `http://127.0.0.1:7788`
2. 느린 지표 수집: `node scripts/hud/collect.js --clicks --redis [--ads-file <ads-cycle.out>] [--gate "..."]`
3. 스냅샷 저장(기준선/사후): `curl -s localhost:7788/api/snapshot > .agent/hud/snap-<라벨>.json`
4. 비교표: 모델별 출력·캐시생성 토큰 · 도구 호출 수 · 턴 수 · 사이클 시간 · 재시도 수 · 발행/클릭/설치.
5. 비용을 원하면 세션 시작 전 텔레메트리를 켠다(콘솔이 OTLP 를 받는다):
   `CLAUDE_CODE_ENABLE_TELEMETRY=1 OTEL_METRICS_EXPORTER=otlp OTEL_EXPORTER_OTLP_PROTOCOL=http/json OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:7788/otlp claude`
   켜지 않은 세션의 비용은 «미설정»으로 남긴다 — 추측해 적지 않는다.
6. 전사 기반 실측(항상 가능): 콘솔의 «모델별 토큰»·«도구 호출»·«시간대 부하» 는 세션 전사 usage 합산이라 별도 설정이 필요 없다.
