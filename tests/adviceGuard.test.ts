/**
 * 권유어 가드 시험 (2026-10-14) — lib/ai/adviceGuard (푸시 «AI 한 줄»·신호/오늘 볼 것 한 줄이 쓰는 bannedHit 의 본체)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/adviceGuard.test.ts
 *
 * 왜: 10/13 모닝 푸시 일본어 본문이 정적 문구로 나갔다(banned:売り) — 글은 «半導体…に売りが集中している»(시장 서술)이지 권유가 아니었다.
 *   대표 10/14: «권유·명령형(売るべき · 売り推奨 · 買い推奨 · 今すぐ売 …)은 계속 막고, 시장 서술(売り優勢 · 売り圧力 · 売りが先行 …)은 허용. 한·영도 같은 원칙으로 오탐만 줄인다.»
 *
 * 고정하는 것
 *  1) 막아야 할 문장 표(일·한·영) — 권유 · 명령 · 평가(등급) · 글자 없이 사고팔라는 말 · 매수/매도 인접 복합어 뒤에 붙은 권유
 *  2) 통과할 문장 표(일·한·영) — 시장 서술 · 지표/가이던스 이름 · 제3자 거래 · 딜러 헤지 서술
 *  3) 실제 AI 글 — 10/13 운영 모닝 브리핑 3개 언어(예전 목록은 일본어 첫 문장을 막았다) · 실제 코퍼스에서 뽑은 문장
 *  4) 여전히 막는 것 — 투자의견(Buy 등급) · 목표가 · 시장 예측/전망 · 추천
 *  5) 배선 — bannedHit 는 adviceGuard 로 위임, 자체 금지어 목록을 가진 출구가 없다, 종목별 한 줄(신호·오늘 볼 것)은 더 엄한 목록(WL_LINE_FORBIDDEN)을 그대로 함께 건다
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { adviceHit } from '../src/lib/ai/adviceGuard';
import { aiLineFromText, bannedHit, morningAiLines } from '../src/lib/push/aiLine';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const blocked = (list: string[]) => { for (const s of list) assert.ok(adviceHit(s), `막아야 하는데 통과: ${s}`); };
const allowed = (list: string[]) => { for (const s of list) assert.equal(adviceHit(s), null, `통과해야 하는데 막힘: ${s} → ${adviceHit(s)}`); };

// 예전 목록(2026-10-12 ~ 10-13, lib/push/aiLine) — 사고를 재현해 두려고 그대로 둔다
const OLD_BANNED: RegExp[] = [
  /매수|매도|추천|목표\s?주?가|예측|전망|손절|익절|팔아라|담아라/,
  /\b(?:buy|buys|buying|sell|sells|selling|recommend\w*|price\s+target|target\s+price|predict\w*|forecast\w*|outperform\w*|underperform\w*|upgrade[sd]?|downgrade[sd]?|guarantee[sd]?)\b/i,
  /買い|売り|推奨|目標株価|目標価格|予測|予想|見通し|買え|売れ/,
];
const oldHit = (s: string) => OLD_BANNED.some((re) => re.test(s));

// ── 운영 실제 글: 10/13 12:05Z 모닝 브리핑(/api/guardian/briefing — source claude) ──
const MORNING_1013 = {
  ko: { date: "10/13/2026", generatedAt: "2026-10-13T12:05:37.479Z", source: 'claude', degraded: false, briefing: "화요일 개장 전 거래에서 S&P 500 선물이 7,850.75(-0.09%), NASDAQ 100 선물이 30,675.75(-0.72%)로 약보합 출발함. 반도체 섹터 -1.9%, AI Power Grid -1.5%로 기술주 약세가 관찰되며, 대형 은행 실적 발표를 앞두고 관망세가 나타남. 한편 필수소비재 +0.9%, 소재 +0.8%로 방어적 섹터로의 순환매가 관찰되고 Russell 2000 선물은 +0.21%로 상대적 강세를 보임. RLSI 34.4와 Breadth 42.1%, 레짐 BEAR는 시장 내부 폭이 좁고 약한 상태를 함께 가리키며, VIX 15.41은 VIX3M 17.93 대비 0.859 콘탱고로 단기 공포가 제한적임을 보여줌. 다만 GEX -8과 Squeeze Risk 34%는 기술주 하락 시 변동성이 커질 수 있는 구조를 나타내고, 감마 지지·저항 레벨은 데이터에 제공되지 않음. 10:00 ET 기존주택판매 발표가 경제 지표상 가장 가까운 변수이며, 실적 발표 이후 기술주가 회복하는지 여부가 시장 방향을 가르는 기준으로 관찰됨." },
  en: { date: "10/13/2026", generatedAt: "2026-10-13T12:05:37.479Z", source: 'claude', degraded: false, briefing: "Tuesday pre-market trading shows S&P 500 futures at 7,850.75 (-0.09%) and NASDAQ 100 futures at 30,675.75 (-0.72%), with weakness concentrated in Semiconductors (-1.9%) and AI Power Grid (-1.5%) as investors await big bank earnings. Defensive sectors such as Consumer Staples (+0.9%) and Materials (+0.8%) are gaining, and Russell 2000 futures are up 0.21%, indicating rotation rather than broad selling. RLSI at 34.4 and breadth at 42.1% under a BEAR regime point to a narrow and weak internal market structure. VIX at 15.41 sits in contango against VIX3M at 17.93 (ratio 0.859), so near-term fear is contained even as the index tape softens. GEX of -8 and a 34% squeeze risk suggest that tech declines could amplify volatility, while gamma support and resistance levels are not provided in the data. The 10:00 ET Existing Home Sales release is the nearest scheduled catalyst, and whether tech recovers after bank earnings is the variable that will show if the rotation holds." },
  ja: { date: "10/13/2026", generatedAt: "2026-10-13T12:05:37.479Z", source: 'claude', degraded: false, briefing: "火曜日のプレマーケットでは、S&P 500先物が7,850.75(-0.09%)、NASDAQ 100先物が30,675.75(-0.72%)と軟調に推移しており、大手銀行決算を控えて半導体(-1.9%)とAI Power Grid(-1.5%)に売りが集中している。一方で生活必需品(+0.9%)や素材(+0.8%)には買いが入り、Russell 2000先物も+0.21%と、全面安ではなく資金の循環が観察される。RLSIは34.4、ブレッドスは42.1%でレジームはBEARにあり、市場内部の幅が狭く弱い構造を示している。VIXは15.41でVIX3M 17.93に対する比率は0.859のコンタンゴであり、指数が弱含んでも短期的な恐怖感は限定的である。GEXは-8、スクイーズリスクは34%で、テクノロジー株の下落がボラティリティを増幅させ得る構造が見て取れるが、ガンマのサポート・レジスタンス水準はデータに含まれていない。直近の予定イベントは10:00 ETの既存住宅販売で、銀行決算後にテクノロジー株が持ち直すかどうかが、この資金循環が続くかを見極める変数となる。" },
};

console.log('━━━ 1. 막아야 할 문장 ━━━');
t('일본어 — 권유·명령·평가 (대표 지정: 売るべき · 売り推奨 · 買い推奨 · 今すぐ売)', () => blocked([
  '今は売るべき局面である', '買うべき銘柄が並ぶ', '売り推奨に引き下げられた', '買い推奨が増えた', '今すぐ売る判断が必要だ', '今すぐ売れ', '今すぐ買い増したい',
  '買い時が来た', '売り時だ', '売りどきを探る', '買いシグナルが点灯', '売りのシグナルが出た', '買いを検討してください', '売りを急ぐべきだ', '買いが妥当', '売りが有利', '買いと判断する',
  'ゴールドマンがパランティアを買いに格上げ', 'ゴールドマンの買い格上げ', '押し目を買いましょう', '売ってください', '売った方がいい', '売るほうがよい', '株は買いです', 'ここは買いだ', '売れ。', '売りが優勢なので買い増しを検討すべき', '買いが入っているうちに売るべき', '下落時は買いで対応する', '売り目線で臨む',
]));
t('한국어 — 권유·명령·평가', () => blocked([
  '지금 매수하세요', '매도하라', '매수 추천', '매도 의견 유지', '매수 기회', '매수 타이밍', '매수 시점', '매수 업그레이드', '매수 등급 상향', '매수를 고려할 만합니다', '매수에 나서세요', '매수를 서두르세요',
  '오늘 매수', '분할 매수', '적극 매도', '지금 사세요', '지금 파세요', '매수세에 올라타세요', '팔아라', '담아라', '손절 필요', '기관 매수 등급 63%',
  '매수세가 강하니 매수하세요',   // 서술 뒤에 이어진 권유
  '지금은 매도가 답이다', '하락 시 매수로 대응', '눌림목에서 매수 관점 유지', '매수 우위지만 추격 매수는 자제',
]));
t('영어 — 권유·명령·평가', () => blocked([
  'Buy the dip now', 'Buy now', 'Buy dips.', 'Futures rise. Buy tech.', 'Sell rallies now', 'You should buy NVDA', 'traders should buy dips', 'dealers must sell into strength',
  'consider selling', 'worth buying', 'time to buy', 'good time to sell', 'it is a buy', 'rated Buy', 'Strong Buy', 'buy rating', 'sell signal', 'Goldman upgrades Palantir to Buy',
  'We recommend adding exposure', 'Sell NVDA before earnings', 'guaranteed gains', 'Let us buy more', 'Buying looks attractive here', 'Selling makes sense at these levels', 'Investors should consider buying the dip', 'It makes sense to sell here', 'Investors who sell now',
]));

console.log('━━━ 2. 통과할 문장 (시장 서술) ━━━');
t('일본어 — 売り優勢 · 売り圧力 · 売りが先行 · 買いが入る · 空売り · 自社株買い …', () => allowed([
  '半導体(-1.9%)とAI Power Grid(-1.5%)に売りが集中している', '生活必需品(+0.9%)や素材(+0.8%)には買いが入り', '幅広い買いが観察されている', '売り優勢の展開', '買い優勢で始まった', '売り圧力が強まる', '買い圧力が後退した',
  '売りが先行', '買いが先行した', '売りが一巡した', '買い戻しが入った', '空売り比率は低下した', '自社株買いを発表した', '債券売りが同時進行する', 'ハイテク主導の買いを支えており', '買いと売りが交錯する',
  '売り上げが予想を上回った', '機関の買い集め', '静かな売り抜け', '売れ行き好調', '日銀の国債買い入れ', 'インサイダー売り12件', 'コール買いが増加', '内部者の純売り', 'アナリスト評価(買い63%)', '技術株の買い意欲を支えている', '広範な買いよりも循環物色', '買いで始まった', '売りで推移している', '全面的な買いではなく選別的な資金移動が観察される',
  'S&P 500の予想益回り5.3%', '売上見通しを再確認', '通期の業績予想を上方修正', '市場予想を上回る決算',
]));
t('한국어 — 매수세 · 매도 압력 · 순매수 · 공매도 · 제3자 거래 …', () => allowed([
  '광범위한 매수세가 관찰됨', '기술주 중심 매수 심리를 뒷받침', '대형 바이오에 매도 압력', '매도세가 이어짐', '오늘 매수세가 유입', '순매수 전환', '외국인 매수 전환', '공매도 비중이 낮아짐', '대주주 매도 신고', '대주주 매도 신청',
  '콜 매수 증가', '매수가 몰리며', '선별적 매수세', '기술 섹터 순환 매수', '내부자는 30일간 매수 0, 매도 5', '광범위한 매수인지 구분되지 않음', '매출 전망 재확인', '컨센서스 전망치를 상회',
]));
t('영어 — buying/selling pressure · sell-off · net buying · insider sells · dealer hedging …', () => allowed([
  'tech-led buying', 'broad-based buying', 'selling pressure in semis', 'a sell-off in chips', 'Sell-off in chips deepened', 'net buying by institutions', 'heavy call buying', 'short selling rose', 'Selling pressure mounts',
  'Insiders show 0 buys and 12 sells', 'Dealer hedging adds to moves: selling into strength and buying into weakness', 'dealers sell rallies and buy dips', "Eli Lilly's Biggest Shareholder Filed to Sell $347 Million of Stock",
  'Investors buy the dip', 'Small caps underperformed', 'outperformance of semis', 'buy-side positioning shifted', 'Buy now pay later lenders rallied',
]));

console.log('━━━ 3. 실제 AI 글 ━━━');
t('10/13 운영 모닝 브리핑 — 예전 목록은 일본어 첫 문장을 «売り» 로 막았다, 지금은 3개 언어 모두 AI 한 줄', () => {
  const jaFirst = MORNING_1013.ja.briefing.split('。')[0] + '。';
  assert.ok(oldHit(jaFirst), '사고 재현: 예전 목록은 이 문장을 막았다');
  assert.equal(bannedHit(jaFirst), null);
  const r = morningAiLines(MORNING_1013 as any, new Date('2026-10-13T12:10:00Z'));
  for (const l of ['ko', 'en', 'ja'] as const) assert.equal(r[l].reason, 'ok', `${l}: ${r[l].reason}`);
  assert.ok(r.ja.line && /^火曜日のプレマーケット/.test(r.ja.line));
  // 문장 전체(6문장)에도 권유 틀은 없다
  for (const l of ['ko', 'en', 'ja'] as const) assert.equal(adviceHit(MORNING_1013[l].briefing), null, l);
});
t('실제 코퍼스(DEPTH-2026-10-11 모닝 브리핑)에서 뽑은 오탐 문장 — 예전엔 막혔고 지금은 통과', () => {
  const real = [
    '金曜日のプレマーケットではS&P 500先物が7,859.75(+0.56%)、NASDAQ 100先物が31,108.75(+0.45%)と上昇しており、Russell 2000先物も2,822.10(+0.44%)と堅調で、幅広い買いが観察されている。',
    '金曜日のプレマーケットではS&P 500先物が7,859.75(+0.56%)、NASDAQ 100先物が31,108.75(+0.45%)で始まり、ラッセル2000先物も2,822.10(+0.44%)と小型株に広く買いが入っていることが観察される。',
    '金先物は+1.43%と堅調な一方、米10年債利回りは1bp上昇の5.24%にとどまり、債券市場からの強い売り圧力は確認されていない。',
    'Nasdaq-100が3年連続で20%以上上昇したことや、予想を上回る決算を伝える報道がハイテク主導の買いを支えており、サイバーセキュリティ(+4.3%)とAI Power Grid(+2.4%)の強さもその流れと整合している。',
    '本日は高インパクトの経済指標発表がなく、S&P 500の予想益回り5.3%と10年名目利回り5.24%の差がほぼゼロに近づいている水準が、金曜日の取引時間中における中心的な観察変数として位置づけられる。',
    'Russell 2000 선물은 2,822.10(+0.44%)로 동반 상승하며 광범위한 매수세가 관찰됨.',
    'Nasdaq-100이 3년 연속 20% 이상 상승한 흐름과 연간 실적 개선 보도가 기술주 중심 매수 심리를 뒷받침하는 것으로 관찰됨.',
    'Friday pre-market trading shows S&P 500 futures at 7,859.75 (+0.56%) and NASDAQ 100 futures at 31,108.75 (+0.45%), with Russell 2000 futures also higher at 2,822.10 (+0.44%), indicating broad-based buying.',
    'Cybersecurity leads sector performance at +4.3% and AI Power Grid at +2.4%, while Communication Services lags at -1.5%, indicating rotation within the rally rather than broad-based buying.',
    'Zscaler 6% 급등, IBM 보안 제휴·매출 전망 재확인', 'Zscaler +6%、売上見通し再確認とIBMセキュリティ提携', "Eli Lilly's Biggest Shareholder Filed to Sell $347 Million of Stock",
    'Net GEX of 74.1M in positive gamma means dealers buy dips and sell rallies, damping volatility.',
    'Insiders recorded net selling over the last 30 days (5 sales, net $5.5M), so positive news and insider selling diverge.',
  ];
  for (const s of real) { assert.ok(oldHit(s), `예전 목록이 막던 문장이어야 한다: ${s}`); assert.equal(adviceHit(s), null, s); }
});

t('★10/24 T25 운영 Tactical·장마감 원인 서술 — «기술주 매도로 금리가…»(운영 Tactical ko 6회 중 4회 탈락)·«매수 폭이 제한»·«買い幅が限定» 통과', () => allowed(['10/23(금) 10:51 ET 보도에 따르면 기술주 매도로 10년물 금리가 5% 아래로 내려가면서 채권으로 자금이 이동했습니다.', '10/23 10:51 ET 보도는 AI 관련 기술주 매도로 국채 금리가 5% 아래로 밀렸다고 전했습니다.', '10/23(금) 10:51 ET 보도에 따르면 AI 관련 기술주 매도로 국채로 자금이 몰리며 10년물 금리가 5% 아래로 밀렸습니다.', '10/23(금) 10:51 ET 보도에서 AI 주식 매도가 10년물 채권 매수로 이어지면서 10년물 금리가 5% 아래로 내려간 것으로 전해졌습니다.', '10/23(금) 10:51 ET 보도에 따르면 기술주 매도로 채권 선호 현상이 일어나면서 10년물 금리가 5% 아래로 내려왔습니다.', '나스닥은 일부 반도체 매수로 하락폭이 제한됐다.', '외국인 투자자들의 반도체 종목 매수로 코스피가 3% 급등했습니다.', '변동성 지수(VIX 19.6)는 높아진 상태로 매수 폭이 제한되는 구조입니다.', '변동성 지수(VIX) 19.6으로 높아진 상태에서 약한 매수력이 가격 하락을 완충하지 못하고 있습니다.', '변동성이 매수 폭을 제한하고 있습니다.', '매수 폭이 제한된 상태', '変動性指数(VIX 19.6)は高止まりしたままで買い幅が限定される構造です。', '変動性指数(VIX)19.6で高まった状況が買い幅を制限しています。']));
t('★10/24 T25 같은 낱말이라도 권유면 계속 막는다 — 관문 10242306~10250048 반례 전부(새 허용은 권유 표지 없는 서술 문장에서만)', () => blocked(['지금은 매도로 대응하세요', '매도로 전환할 시점입니다', '매수로 접근하는 게 좋습니다', '이제 매수로 갈아타기', '매수의 기회입니다', '지금은 매수가 유리한 때다', '기술주 매도로 가야 합니다', '기관 매수하세요', '매수 포지션을 늘리세요', '매수 폭을 늘리는 게 좋습니다', '선택적 매수 기회', '하락 시 매수.', '청산 매도에 동참하세요', 'チップの売りを急ぐべき', '機関が買い進めましょう', 'セキュリティ銘柄の選別買い機会を提示', 'ヘッジ売りで対応してください', '買い幅を広げるべきだ', '매수 포지션을 확대해야 합니다', '청산 매도가 필요합니다', 'ヘッジ売りが有利です。', '선택적 매수가 바람직합니다', '매도로 위험을 분산하는 전략을 쓰십시오.', '하락 시 매수·상승 시 매도, 꾸준히 실행하십시오.', '売りで損失を抑えるのが得策です。', '매수 포지션을 늘려야 합니다.', '매수의 타이밍을 놓치지 말아야 합니다.', '매수·매도 비중을 줄여야 합니다.', '買いへ切り替えるとよいでしょう。', '시장 변동성이 크므로 매수 포지션을 늘려야 합니다.', '기술주 매도로 금리가 4.9%까지 밀린 지금 대응하세요', '기술주 매도로 금리가 하락한 만큼 채권 비중을 늘려야 합니다', '매수 폭이 제한된 지금은 관망이 바람직합니다', 'ヘッジ売りで増幅されるので、押し目を拾うのが賢明です', '하락 시 매수·상승 시 매도 원칙을 지키는 게 현명합니다', '기술주 매도로 금리가 내려간 지금이 채권을 담을 때입니다', '매수력이 약해진 만큼 현금 비중 확대가 합리적입니다', '安全資産買い（利回り低下）に乗るのが得策です。', '하락 시 매수·상승 시기를 노려 매도.', '기술주 매도로 금리가 하락했으니 채권 매수 비중 확대 바랍니다.', '매수 포지션을 U.S. ETF 중심으로 늘려야 합니다.', '매수 폭이 제한된 지금 관망이 맞다.', '기술주 매도로 금리가 내려갔으니 비중을 줄일 것.', 'ヘッジ売りで値動きが増幅されるので、押し目を拾えば良い。', '매수 포지션을 늘려보는 건 어떨까요?', '買い幅を広げてみませんか。', '매수는\n정답입니다.', '買い\nを検討してください。', '시장 흐름에 맞춰 매수 포지션을 늘립시다.', '매수 포지션을 축소하시오.', '하락 시 매수·향후 지수 전망에 따라 매도.', '매수 포지션을 늘려', '買い幅を広げろ。', '시장 흐름에 맞춰 매수 포지션 확대를 건의합니다.', '市場の流れに合わせて買い幅を広げることを提案する。', '매수 포지션을 늘린다.', '매수 포지션을 늘릴 시점이다.', '매수 포지션 정리를 주문한다.', '매수 폭이 제한된 지금 현금 비중 확대가 필수다.', '투자 지침: 매수 포지션은 반드시 늘린다.', '기술주 매도로 금리가 하락했으니 지금 매수 기회입니다', '매수 폭이 커진 지금 들어가자.', '買い幅が広がった今こそ参入だ。', '기술주 매도로 금리가 밀렸다. 채권을 담으세요.']));
t('★10/24 T25 옛 판정은 그대로 — 다른 대상의 평가어·제3자 의도·과거 비교·인용 안내·감탄 서술은 옛처럼 통과', () => allowed(['매수가 유입됐지만 지수 상승은 완만합니다.', '순매수가 늘었고 원화 약세는 수출주에 유리합니다.', '自社株買いが株価を支え、円安が輸出企業に有利です。', '自社株買いが増え、業績は前期の方が良いです。', '自社株買いが増え、業績は前期の方が良かった。', '自社株買いが増え、企業は設備投資を縮小しようとしている。', 'テック買いを検討した結果、機関は取引を見送った。', '自社株買いが増える一方、企業が解決すべき供給制約は残っている。', '외국인 매수가 몰려 상승세가 가팔라!', '自社株買いが増え、会社は「決算資料をご確認ください」と株主に案内した。', '반도체 매수가 유입되기 시작한 시점이다.', '매수가 때마침 유입됐다', '반등에는 매수세 유입이 필요하다', '空売りが急増した', 'コール買いが急増した', '自社株買いを検討している', '買いが優勢で、上値は限定的な状況が続くよう。', '매수세가 몰렸고 순매수가 이어졌으며 공매도는 줄었다.']));
t('★10/24 T25 새 허용 머리 × 권유 끝맺음 조합 전수 — 하나도 통과하지 않는다', () => {
  const KO_HEAD = ['기술주 매도로 금리가 내려갔으니', '채권 매수로 자금이 몰린 만큼', '매수 폭이 제한된 지금', '약한 매수력이 드러난 만큼', '반도체 매수로 하락폭이 제한된 만큼', '기술주 매도로 국채 금리가 5% 아래로 밀렸으므로'];
  const KO_END = [' 비중을 줄일 것.', ' 매수 포지션을 정리하면 된다.', ' 관망이 맞다.', ' 현금 확보가 정답이다.', ' 분할로 들어가고 싶다.', ' 지금이 나설 때.', ' 방어주에 주목할 만하다.', ' 채권 비중을 늘려 두자.', ' 신중하게 접근하길 권한다.', ' 당분간 쉬어 가는 편이 낫다.', ' 손절 기준을 세워 두세요.', ' 반등을 노릴 만하다.', ' 일부 차익을 챙기는 것이 좋겠다.', ' 이 흐름에 올라탈 기회다.', ' 저가 매수 관점이 유효하다.', ' 채권을 늘립시다.', ' 비중을 축소하시오.', ' 들어가라.', ' 지금 사자.', ' 현금화가 필수다.', ' 관망이 최선이다.', ' 채권 확대를 건의한다.', ' 포지션 정리를 주문한다.', ' 분산이 상책이다.', ' 어떨까요?', ' 채권으로 갈아타기.'];
  const JA_HEAD = ['買い幅が限定される局面では', '買い幅が広がった今、'];
  const JA_END = ['押し目を拾えば良い。', '債券を買い増したい。', '守りを固めるのが一択。', '現金比率を高めておくこと。', '少しずつ仕込んでおきたい。', '様子を見てはどうか。', 'ディフェンシブが妙味。', 'ここは利確が一手。', '静観が賢明。', '参入を提案する。', '買い増しを促す。', '静観が肝要だ。', '守りが必須だ。', '積み増せ。', '買い増しましょう。', '検討してください。'];
  blocked([...KO_HEAD.flatMap(h => KO_END.map(e => h + e)), ...JA_HEAD.flatMap(h => JA_END.map(e => h + e))]);
});

console.log('━━━ 4. 여전히 막는 것 ━━━');
t('투자의견(등급) · 목표가 · 시장 예측/전망 · 추천은 그대로 막힌다', () => blocked([
  'Goldman Sachs upgrades Palantir to Buy, 18% upside', 'Goldman upgrade news noted as catalyst', 'Goldman, Palantir 매수 상향 (목표 상승여력 18%)', 'ゴールドマン、パランティアを買いに格上げ',
  'analysts raised the price target', '목표주가 상향', 'アナリストは目標株価を引き上げ', 'BEARISH 전망으로 가격과 옵션 신호가 엇갈립니다', 'BEARISH見通しで', 'analysts recommend adding exposure', 'CrowdStrike recommends stockholders reject the offer',
  '종목 추천', '市場は上昇すると予測される', 'we predict a rally', 'forecast a rebound',
]));
t('첫 문장에 걸리면 line=null · reason=banned:<조각>', () => {
  const r = aiLineFromText('今すぐ売る判断が必要で、S&P 500先物は-0.09%と軟調に推移している。次の文。', { locale: 'ja', currentYear: 2026 });
  assert.equal(r.line, null);
  assert.ok(r.reason.startsWith('banned:'), r.reason);
  const ok = aiLineFromText('半導体(-1.9%)に売りが集中し、S&P 500先物は-0.09%と軟調に推移している。次の文。', { locale: 'ja', currentYear: 2026 });
  assert.equal(ok.reason, 'ok');
});

console.log('━━━ 5. 배선 ━━━');
const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
t('bannedHit 는 adviceGuard 로 위임하고, aiLine 에 자체 금지어 목록이 없다', () => {
  const src = read('src/lib/push/aiLine.ts');
  assert.ok(/import \{ adviceHit \} from '@\/lib\/ai\/adviceGuard'/.test(src));
  assert.ok(/export function bannedHit\(text: string\): string \| null \{\s*return adviceHit\(text\);\s*\}/.test(src));
  assert.ok(!/const BANNED\b/.test(src), 'aiLine.ts 에 옛 BANNED 목록이 남아 있다');
});
t('같은 가드를 쓰는 출구는 전부 bannedHit 하나를 거친다 — 자체 buy/sell 금지어 목록을 새로 만든 출구가 없다', () => {
  const walk = (d: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const files = walk('src/lib').concat(walk('src/app/api'));
  const users = files.filter((f) => /\bbannedHit\(/.test(read(f))).sort();
  assert.deepEqual(users, ['src/lib/ai/signalLine.ts', 'src/lib/ai/todayPicksLine.ts', 'src/lib/push/aiLine.ts']);
  const own = files.filter((f) => f !== 'src/lib/ai/adviceGuard.ts' && /const BANNED\b\s*[:=]/.test(read(f)) && /매수\|매도|buy\|buys/.test(read(f)));
  assert.deepEqual(own, [], `자체 금지어 목록: ${own.join(', ')}`);
});
t('종목별 한 줄(신호 · 오늘 볼 것)은 bannedHit 가 풀려도 더 엄한 목록(WL_LINE_FORBIDDEN)을 그대로 함께 건다', () => {
  for (const f of ['src/lib/ai/signalLine.ts', 'src/lib/ai/todayPicksLine.ts']) {
    const s = read(f);
    assert.ok(/for \(const re of WL_LINE_FORBIDDEN\)/.test(s), f);
    assert.ok(/bannedHit\(/.test(s), f);
  }
  const wl = read('src/lib/ai/watchlistLine.ts');
  assert.ok(/買い\|\(\?<!空\)売り/.test(wl) && /매수\|\(\?<!공\)매도/.test(wl), 'WL_LINE_FORBIDDEN 이 매수·매도·買い·売り 를 계속 막아야 한다');
});

console.log(`\n${n}개 통과`);
