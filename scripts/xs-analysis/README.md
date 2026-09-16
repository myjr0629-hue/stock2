# XS(알파스코어) 독립 재계산·개선 시뮬레이션 (2026-09-16)

원자료: DynamoDB `signum-xs-history`(2026-07-06~08-31, 74,799행: 팩터별 z·xsScore·raw·res·close·mcap) + `signum-alpha-history`(V8 점수·9/1~9/4 종가 보강).

```
NODE_PATH=$REPO/node_modules node scripts/xs-analysis/xs-extract.js   # → /tmp/ego/xs-data.json, v8-data.json (읽기 전용 스캔, ~3분)
node scripts/xs-analysis/xs-analyze.js    # IC·데실·비용·팩터 IC·지속성·V8 맞대결
node scripts/xs-analysis/xs-simulate.js   # 변환 분해·팩터 부분집합·워크포워드·지평·필터·레짐·집중도
node scripts/xs-analysis/xs-robust.js     # 최고일 제외·T+5·롤링 워크포워드·블록 부트스트랩·회전율/EMA
node scripts/xs-analysis/xs-portfolio.js  # 롱온리/롱숏 바스켓 승률·연환산·샤프·MDD (비용·시장조정)
```

라벨 = close[t+h]/close[t]−1 − 당일 유니버스 평균(시장조정). t 통계는 Newey-West(lag 2). 비용 가정: 왕복 >$50B 10bp / >$10B 20bp / >$2B 40bp / <$2B 100bp. 결과 해석은 `.agent/ALPHA_SCORE_FULL_REPORT_2026-09-16.md` 및 후속 보고서 참조. 주의: 8주·상승장 단일 구간, «4팩터» 선택은 전기간 IC 를 본 뒤의 선택(롤링 워크포워드로 부분 검증).
