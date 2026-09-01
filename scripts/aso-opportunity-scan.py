#!/usr/bin/env python3
# ============================================================================
# aso-opportunity-scan — 「수요는 있는데 경쟁이 빈」 앱스토어 검색어를 찾는다.
# ----------------------------------------------------------------------------
#   python3 scripts/aso-opportunity-scan.py
#
# 왜 이게 필요한가 (2026-09-02 대표 지적):
#   맥스페인·다크풀·GEX 같은 «전문가 용어»에 갇혀 있었다. 실측해보니
#   그 말들은 경쟁이 약한 게 아니라 **아무도 안 찾는** 쪽에 가까웠다
#   (max pain 은 그 말을 이름에 넣은 앱이 0개, options flow 전용앱 평점 0~17).
#   사람은 「미국주식」「무료 주식 앱」「실적 발표 일정」으로 찾는다.
#   → 넓은 말 × 무료/실시간/알림/캘린더 같은 수식어를 «조합»해서 훑는다.
#
# 판정 기준: 상위 5개 앱의 평점 수 «중앙값».
#   ≤100   ★★즉시  — 평점 0인 우리도 뚫린다
#   ≤1000  ★가능
#   ≤10000 △해볼만
#   그 위   불가    — Yahoo/TradingView/Robinhood 급이라 이름 바꿔도 못 들어간다
#
# ⚠️ 이건 «경쟁 강도»지 «검색량»이 아니다. 진짜 검색량은 Apple Search Ads 의
#    인기도 점수(0~100)뿐이고 그건 계정 로그인이 필요하다.
# ============================================================================
import json, urllib.parse, urllib.request, statistics, time, itertools
OURS = {6783130444:'SIGNUM', 6788779895:'UC', 6794356135:'WIM'}
def scan(term, cc):
    u=f"https://itunes.apple.com/search?term={urllib.parse.quote(term)}&country={cc}&entity=software&limit=25"
    try:
        with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=25) as r:
            d=json.load(r)
    except Exception: return None
    res=d.get('results',[])
    if not res: return None
    med=int(statistics.median([a.get('userRatingCount',0) for a in res[:5]]))
    mine=[f"{OURS[a['trackId']]}={i}" for i,a in enumerate(res,1) if a['trackId'] in OURS]
    return {'t':term,'cc':cc,'med':med,'n':d.get('resultCount',0),'top':res[0]['trackName'][:28],'mine':','.join(mine) or '—'}

COMBOS = {
 'kr': ["무료 주식 앱","무료 주식 정보","무료 증시","주식 실시간","실시간 주가","주식 속보","미국주식 실시간",
        "미국주식 무료","미국주식 앱","미국주식 뉴스","미국주식 차트","미국주식 알림","해외주식 실시간",
        "실적 발표 일정","어닝콜","기업 실적 발표","증시 캘린더","프리장","애프터마켓","시간외 거래",
        "주식 알림 앱","주가 알림","종목 분석","AI 주식","주식 리포트","오늘의 증시","장마감","시황"],
 'jp': ["無料 株","無料 米国株","米国株 アプリ","米国株 リアルタイム","米国株 ニュース","決算 カレンダー",
        "決算 スケジュール","決算速報","時間外取引","プレマーケット 米国株","株 速報","株価 アラート",
        "米国株 チャート","米国株 分析","AI 株","相場 ニュース","今日の株価","市況"],
 'us': ["free stock app","free stock alerts","free market data","real time stocks","premarket movers",
        "premarket scanner","after hours trading","earnings today","earnings alerts","earnings season",
        "stock market today","daily market brief","market recap","stock heatmap","unusual volume",
        "institutional trading","smart money","whale trades","free options data","free stock screener",
        "market open","closing bell","stock ideas","AI stock analysis"],
}
rows=[]
for cc,terms in COMBOS.items():
    for t in terms:
        r=scan(t,cc)
        if r: rows.append(r)
        time.sleep(0.2)
print(f"{'조합어':<26} {'국가':<4} {'중앙값':>10} {'판정':<8} {'우리':<16} 1위앱")
print("─"*100)
for r in sorted(rows,key=lambda x:(x['cc'],x['med'])):
    m=r['med']
    if m>3000: continue
    v='★★즉시' if m<=100 else ('★가능' if m<=1000 else '△')
    print(f"{r['t']:<26} {r['cc']:<4} {m:>10,} {v:<8} {r['mine']:<16} {r['top']}")
print(f"\n총 {len(rows)}개 측정 · 3,000 이하만 표시")
