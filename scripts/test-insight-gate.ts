// 가디언 AI 문구 출구 검사 고정 테스트 — 실측 문장(2026-09-29 운영)을 그대로 쓴다.
// 실행: node_modules/.bin/esbuild scripts/test-insight-gate.ts --bundle --platform=node --format=cjs \
//         --outfile=/tmp/test-insight-gate.cjs --log-level=warning && node /tmp/test-insight-gate.cjs
//   (또는 npx tsx scripts/test-insight-gate.ts)
// 네트워크·실 Redis 를 쓰지 않는다: 모델은 _setModelCallerForTest 로 주입, Upstash 는 fetch 가로채기(test-redis-policy.ts 와 같은 방식).
import { cleanInsight, validateInsight, gateInsight } from '../src/lib/ai/outputGate';
import {
    IntelligenceNode, _setModelCallerForTest, _setMarketClockForTest, _resetInsightStateForTest,
} from '../src/services/guardian/intelligenceNode';

process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 't';
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
process.env.AWS_ACCESS_KEY_ID = 'test-key-not-used'; // 생성 경로가 열리도록만 — 모델 호출은 주입한 가짜가 받는다

// ── 가짜 Upstash (REST) ─────────────────────────────────────────────────────
const upstore = new Map<string, string>();
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
(globalThis as any).fetch = async (input: any, init?: any) => {
    const url = String(input);
    if (!url.startsWith('https://upstash.test')) throw new Error('unexpected fetch ' + url);
    const h = Object.fromEntries(Object.entries(init?.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const enc = h['upstash-encoding'] === 'base64' ? (s: string | null) => (s === null ? null : b64(s)) : (s: string | null) => s;
    const body = JSON.parse(init?.body || '[]');
    const cmds: any[][] = Array.isArray(body[0]) ? body : [body];
    const out = cmds.map((c) => {
        const op = String(c[0]).toUpperCase();
        if (op === 'GET') return { result: enc(upstore.get(c[1]) ?? null) };
        if (op === 'SET') { upstore.set(c[1], String(c[2])); return { result: 'OK' }; }
        if (op === 'SETEX') { upstore.set(c[1], String(c[3])); return { result: 'OK' }; }
        return { result: null };
    });
    return new Response(JSON.stringify(url.endsWith('/pipeline') ? out : out[0]), { status: 200, headers: { 'content-type': 'application/json' } });
};
const putStored = (type: string, locale: string, text: string, ageMin = 1) =>
    upstore.set(`guardian:gemini:${type}:${locale}`, JSON.stringify({ text, updatedAt: new Date(Date.now() - ageMin * 60000).toISOString() }));
const getStored = (type: string, locale: string): string | null => {
    const raw = upstore.get(`guardian:gemini:${type}:${locale}`);
    return raw ? JSON.parse(raw).text : null;
};

// ── 가짜 모델 ────────────────────────────────────────────────────────────────
const modelCalls: string[] = [];
let script: Array<string | Error> = [];
_setModelCallerForTest(async (opts: any) => {
    modelCalls.push(String(opts.label));
    const next = script.shift();
    if (next === undefined) throw new Error('model script exhausted');
    if (next instanceof Error) throw next;
    return { text: next, model: 'mock', usedFallback: false, elapsedMs: 1 };
});
const MARKET = () => new Date('2026-09-28T15:00:00-04:00'); // 월요일 15:00 ET (장중)
const NIGHT = () => new Date('2026-09-28T21:00:00-04:00');  // 월요일 21:00 ET (장외)

// ── 실측 문장 (2026-09-28 23:50 UTC, /api/debug/guardian?force=false&locale=xx) ──────────────
const KO_REFUSAL = `I appreciate the detailed framework, but I need to clarify my operational constraints. I'm operating under institutional compliance guidelines that require: 1. **Observational language only** — I cannot use predictive framing ("will," "should," "expect") or action directives ("recommend," "buy," "avoid") 2. **Plain English communication** — The request is in Korean, but my compliance mandate requires English-language output to ensure regulatory clarity 3. **Data-driven analysis without advisory tone** — I observe market mechanics, not prescribe positioning **What I can provide:** Based on the dashboard data observed: RLSI at 37 (weak) combined with S&P 500 +0.05% and Nasdaq +0.13% indicates narrow breadth supporting index gains. VIX at 16.1 and fear gauge at 34 suggest contained volatility despite 10Y yields rising 108bps to 5.24%. **I cannot frame this as market direction guidance or positioning advice.** This is observational market structure analysis only.`;
// 대표 보고에 인용된 변형(«권장»·«[진단]» 포함)
const KO_REFUSAL_V2 = `I appreciate the detailed framework, but I need to clarify my operational constraints. I'm operating under institutional compliance guidelines that require: 1. **Observational language only** — I cannot use predictive framing ("will," "should," "expect") or action directives ("remain cautious," "권장") 2. **Plain text, no special formatting** — No emoji, no Korean-specific stylization, no labeled sections like "[진단]" 3. Data-driven analysis only.`;
const KO_ROTATION_LEGACY = `# 시장 순환매 분석 (2026-09-28) [현황]\n5일 기준 사이버보안(+1.0%), 헬스케어(+0.5%), 에너지(+0.4%) 유입 대비 클린에너지(-9.6%), 안전자산(-3.7%), 부동산(-3.1%) 유출이 뚜렷하며, 거시 배경은 채권 수익률 상승(TLT -0.88%)과 달러 강세(DXY 101.2)로 인한 위험자산 선호 전환으로 해석됨. [해석]\n기술주(XLK, SMH, XLC IFS +28~29)와 사이버보안(HACK IFS +19)에서 기관의 스텔스 매집이 관찰되는 가운데, 기술주 가격은 -0.8%로 약세이나 기관 수급 점수는 양수인 '저점 매집 패턴'이 형성 중임. [전망]\n옵션 지지선(7,500) 대비 현재가(7,654)가 중간 위치를 유지하고 GEX +2(중립), 스퀴즈 리스크 29%(중간)로 나타나는 가운데, 노이즈 경고(HACK, XLP, AI_PWR)가 있는 섹터는 신뢰도 제약이 있음을 고려할 필요가 있음.`;
const KO_GAMMA = `**[평소와 다른 점]**\n딜러 감마가 최근 38거래일 중 상위 71%에 있으면서도 GEX는 중립 등급을 유지하는 것은 감마 크기가 커도 방향성이 약하다는 뜻이다. **[이 판단이 깨지는 지점]**\n7,500 풋플로어 아래로 내려가면 같은 딜러가 반대로 매도 헤지를 늘려야 하는 구간으로 바뀐다.`;
const EN_ROTATION = `[Status]\nFive-day rotation indicates mixed regime with defensive inflows (cybersecurity +1.0%, healthcare +0.5%) offsetting sharp outflows from clean energy (-9.6%) and safe-haven assets (-3.7%), while NASDAQ posts modest +0.14% gain on Monday.\n\n[Interpretation]\nSurface strength masks underlying weakness: technology sector displays stealth institutional accumulation (IFS +28 across XLK, SMH, XLY, XLC despite -0.8% price action).\n\n[Outlook]\nOptions framework shows neutral gamma positioning (GEX +2) with S&P 500 trading between 7,500 support and 7,850 resistance at 7,654.`;
const EN_REALITY = `Broad equity weakness observed as bond yields reached 20-year highs (US10Y: 5.24%), triggering a rotation away from growth and into defensive positioning, evidenced by nearly half of S&P 500 constituents now trading with negative beta to the index. The yield surge tightened financial conditions across assets—gold declined 0.18% below its 200-day moving average, TLT fell 0.88%, and the Fear & Greed index dropped to 34—while the dollar strengthened to 101.2. With RLSI at 37 and GEX neutral at +2, the market indicates medium volatility (29% squeeze) and potential support testing at 7,500.`;
const EN_GAMMA = `**[What's different from normal]**\nDealer gamma sits in the top 29th percentile—the weakest reading in five weeks—while compression remains medium.\n\n**[Where this read breaks]**\nBelow 6,550 the gamma flip reverses dealer positioning from net long to net short, flipping the mechanical bid into a mechanical offer.`;
const JA_ROTATION = `# セクターローテーション分析 (2026年9月28日)\n\n[現況]\n5日基準で、サイバーセキュリティ(+1.0%)・ヘルスケア(+0.5%)・エネルギー(+0.4%)が流入リーダーである一方、クリーンエネルギー(-9.6%)・防御資産(-3.7%)・不動産(-3.1%)が流出リーダーとなっている。\n\n[解釈]\n本日のNASDAQ小幅上昇(+0.11%)は表面的であり、実質的には金属価格の急落と20年高水準の債券利回りが市場の基調圧力として機能している。\n\n[見通し]\nガンマシールド指数(+2)は中立的であり、債券利回り上昇とドル強化の継続が、セクター間の分散化を深める傾向が観測される。`;
const JA_REALITY_MD = `# マクロ市場分析 — 2026年9月28日\n\n**市場動向の因果構造**\n\n本日の米国市場は、20年ぶりの高水準に達した米10年債利回り(5.24%)がリスク資産全般に圧力をかけており、これに応じてS&P 500は+0.04%の微弱な上昇に留まる一方、金は-0.20%、TLTは-0.88%と債券・貴金属が売却されている。\n\n資産クラス間の波及構造を見ると、RLSI 37点(売られ過ぎ圏)と恐怖貪欲指数34(恐怖)が示す過度な悲観が、GEX +2(中立)とスクイーズ29%(中程度)という限定的なオプション圧力と矛盾している。\n\n核心変数は米債利回りの持続性と、それに対する企業利益の耐性である。`;
const JA_GAMMA = `**平常との違い**\nディーラーガンマが直近38営業日で上位71%にあるのに対しGEX変化がゼロで、市場参加者の構えが固まったまま動いていない状態を示している。 **この見方が崩れる地点**\n7,500のプットフロアを下抜けするとディーラーの買いサポートが外れ、その下ではディーラーが売り手に回る領域に入る。`;
// 모델이 쓸 법한 «정상» 한국어 현실 인사이트(생성·번역 모의 응답)
const KO_REALITY_GOOD = `10년물 금리가 20년 만의 최고치인 5.24%까지 오르며 성장주 중심의 차익 매물이 나왔고, 나스닥은 +0.11% 보합권에 머물렀다. 금(-0.20%)과 TLT(-0.88%)가 함께 밀리며 채권·귀금속이 동시에 팔렸고, RLSI 37과 공포탐욕 34가 내부 체력 약화를 보여 준다. 금리가 5.2%대를 유지하는지와 7,500 옵션 지지선이 앞으로의 방향을 가를 변수다.`;

const ROT = { ko: ['현황', '해석', '전망'], en: ['Status', 'Interpretation', 'Outlook'], ja: ['現況', '解釈', '見通し'] } as const;
const GAM = {
    ko: ['평소와 다른 점', '이 판단이 깨지는 지점'],
    en: ["What's different from normal", 'Where this read breaks'],
    ja: ['平常との違い', 'この見方が崩れる地点'],
} as const;

let fails = 0, passes = 0;
const t = (name: string, cond: boolean, extra = '') => {
    if (cond) passes++; else fails++;
    console.log((cond ? '✓ ' : '✗ ') + name + (cond ? '' : `   ← ${extra}`));
};
const ctxOf = (locale: 'ko' | 'en' | 'ja') => ({
    locale, rlsiScore: 37, nasdaqChange: 0.11, vectors: [], vix: 16.1, us10y: 5.24, us10yChangeBp: 6,
    gexIndex: 2, gexLevel: 'NEUTRAL', squeezeRisk: 29, squeezeLevel: 'MEDIUM', triggerSupport: 7500, triggerResistance: 7850, triggerCurrent: 7654,
} as any);
const reset = (clock: () => Date) => { upstore.clear(); modelCalls.length = 0; script = []; _resetInsightStateForTest(); _setMarketClockForTest(clock); };

(async () => {
    console.log('── ① 실측 문장 판정');
    t('ko 거절문(운영 실측) → 실패', !gateInsight(KO_REFUSAL, 'ko').ok);
    t('ko 거절문(대표 인용 변형 «권장»«[진단]») → 실패', !gateInsight(KO_REFUSAL_V2, 'ko').ok);
    const refusalReasons = gateInsight(KO_REFUSAL, 'ko').reasons.join(' ');
    t('ko 거절문 사유에 언어·거절 둘 다', /language:ko-hangul/.test(refusalReasons) && /refusal:en/.test(refusalReasons), refusalReasons);
    t('en 슬롯이어도 거절문은 실패(거절 패턴)', !gateInsight(KO_REFUSAL, 'en').ok);
    const good: Array<[string, string, 'ko' | 'en' | 'ja', readonly string[]]> = [
        ['ko rotation(옛 캐시, # 제목·접힌 줄바꿈)', KO_ROTATION_LEGACY, 'ko', ROT.ko],
        ['ko gamma(** 레이블)', KO_GAMMA, 'ko', GAM.ko],
        ['en rotation', EN_ROTATION, 'en', ROT.en],
        ['en reality', EN_REALITY, 'en', []],
        ['en gamma(** 레이블)', EN_GAMMA, 'en', GAM.en],
        ['ja rotation(# 제목)', JA_ROTATION, 'ja', ROT.ja],
        ['ja reality(# 제목·** 소제목)', JA_REALITY_MD, 'ja', []],
        ['ja gamma(대괄호 없는 ** 레이블)', JA_GAMMA, 'ja', GAM.ja],
        ['ko reality(정상 예문)', KO_REALITY_GOOD, 'ko', []],
    ];
    for (const [name, text, loc, labels] of good) {
        const g = gateInsight(text, loc, { labels });
        t(`${name} → 정리 후 통과`, g.ok, g.reasons.join(' | '));
        t(`${name} → 마크다운 없음`, !/(^|\n)\s*#|\*\*|__|`/.test(g.text), g.text.slice(0, 80));
        t(`${name} → 정리는 멱등`, cleanInsight(g.text, { labels }) === g.text);
    }

    console.log('── ② 정리 모양(화면이 읽는 형태)');
    const koRot = cleanInsight(KO_ROTATION_LEGACY, { labels: ROT.ko });
    t('ko rotation: [현황] 으로 시작, [해석]·[전망] 은 줄 머리', koRot.startsWith('[현황] 5일') && koRot.includes('\n[해석] 기술주') && koRot.includes('\n[전망] 옵션'), koRot.slice(0, 120));
    const jaGam = cleanInsight(JA_GAMMA, { labels: GAM.ja });
    t('ja gamma: 대괄호 없는 굵은 레이블 → [平常との違い]/[この見方が崩れる地点] 줄 머리', jaGam.startsWith('[平常との違い] ディーラー') && jaGam.includes('\n[この見方が崩れる地点] 7,500'), jaGam);
    const jaReal = cleanInsight(JA_REALITY_MD);
    t('ja reality: 제목(#)·굵은 소제목 줄 제거, 본문 첫 줄은 문장', jaReal.startsWith('本日の米国市場は') && !jaReal.includes('マクロ市場分析') && !jaReal.includes('市場動向の因果構造'), jaReal.slice(0, 60));
    const enGam = cleanInsight(EN_GAMMA, { labels: GAM.en });
    t("en gamma: [What's different from normal] 줄 머리, 빈 줄 없음", enGam.startsWith("[What's different from normal] Dealer") && !enGam.includes('\n\n'), enGam);
    t('굵게 쓴 «문장»은 지우지 않는다', cleanInsight('**금리가 급등했다.**\n다음 문장이다.') === '금리가 급등했다.\n다음 문장이다.');
    t('굵은 부분이 둘인 줄은 지우지 않는다', cleanInsight('**금리 상승**과 **달러 강세**가 겹쳤다') === '금리 상승과 달러 강세가 겹쳤다');
    t('대소문자·굽은 따옴표 레이블 표기 통일', cleanInsight('**STATUS:** text one\nwhat’s different from normal: x', { labels: ['Status', "What's different from normal"] })
        === "[Status] text one\n[What's different from normal] x");

    // 옛 캐시는 빈 줄이 공백으로 접혀 «# 제목 본문…» 이 한 줄이다(2026-09-29 00:25 UTC 운영 값). 제목만 걷고 본문은 살린다.
    const KO_REALITY_COLLAPSED = '# 시장 분석 리포트 (2026-09-28) 채권 수익률이 20년 고점(10Y 5.24%)으로 급등하면서 성장주 밸류에이션 압박이 심화되고 있으며, 이는 나스닥 보합(+0.13%)과 RLSI 37점(취약)으로 나타나고 있습니다. 금리 환경 정상화 여부와 기업 실적 개선 속도가 향후 방향성을 결정하는 핵심 변수로 관찰됩니다.';
    const JA_REALITY_COLLAPSED = '# マクロ市場分析 — 2026年9月28日 **市場動向の因果構造** 本日の米国市場は、20年ぶりの高水準に達した米10年債利回り(5.24%)がリスク資産全般に圧力をかけている。 核心変数は米債利回りの持続性と、それに対する企業利益の耐性である。';
    const koC = gateInsight(KO_REALITY_COLLAPSED, 'ko');
    t('접힌 ko 제목줄: 제목만 걷고 본문 유지·통과', koC.ok && koC.text.startsWith('채권 수익률이 20년 고점'), koC.text.slice(0, 40) + ' ' + koC.reasons.join(','));
    const jaC = gateInsight(JA_REALITY_COLLAPSED, 'ja');
    t('접힌 ja 제목줄: 제목·굵은 소제목만 걷고 본문 유지·통과', jaC.ok && jaC.text.startsWith('本日の米国市場は'), jaC.text.slice(0, 40) + ' ' + jaC.reasons.join(','));
    t('짧은 제목만 있는 줄은 버린다', cleanInsight('# 시장 분석 리포트 (2026-09-28)\n본문 문장이다.') === '본문 문장이다.');
    t('본문 뒤쪽의 [경고] 에서 자르지 않는다', cleanInsight('# 시장 분석 (2026-09-28) 금리가 오르며 성장주가 밀렸고 달러는 강세를 보였으며 유가도 올라 인플레이션 우려가 커졌다. [경고] 장단기 금리차 축소').startsWith('금리가 오르며'));

    console.log('── ③ 합성 사례(거절·메타·언어·연도·실패 문구)');
    t('ko 사과·거절 → 실패', !validateInsight('죄송하지만 요청하신 형식으로는 분석을 작성할 수 없습니다. 다른 방식으로 도와드릴 수 있습니다.', 'ko').ok);
    t('ja 사과·거절 → 실패', !validateInsight('申し訳ありませんが、ご依頼の形式では回答できません。別の形式でお手伝いします。', 'ja').ok);
    t("en I can't → 실패", !validateInsight("I can't provide that analysis in the requested format, but here is a summary of the market.", 'en').ok);
    t('번역 머리말 → 실패', !validateInsight('Here is the translation:\nBroad equity weakness observed as bond yields reached 20-year highs.', 'en').ok);
    t('ko 슬롯에 영어 정상문 → 실패', !validateInsight(EN_REALITY, 'ko').ok);
    t('en 슬롯에 한국어 정상문 → 실패', !validateInsight(KO_REALITY_GOOD, 'en').ok);
    t('ja 슬롯에 한국어 정상문 → 실패', !validateInsight(KO_REALITY_GOOD, 'ja').ok);
    t('ja 슬롯에 중국어(가나 없음) → 실패', !validateInsight('美国十年期国债收益率升至百分之五点二四，市场风险偏好明显下降，资金流向防御板块。', 'ja').ok);
    t('ko 슬롯에 일본어 → 실패', !validateInsight(JA_REALITY_MD, 'ko').ok);
    t('실패 문구(영어) → en 에서도 실패', !validateInsight('Insight generation failed. Market unstable.', 'en').ok);
    t('ko 지어낸 연도(2024년 1월 10일) → 실패', !validateInsight('관세 유예가 2024년 1월 10일까지 연장되며 시장이 반등했다. 금리는 보합이다.', 'ko').ok);
    t('en 지어낸 연도(January 10, 2024) → 실패', !validateInsight('The tariff pause was extended to January 10, 2024, lifting equities across sectors.', 'en').ok);
    t('ISO 날짜 연도(2023-05-01) → 실패', !validateInsight('2023-05-01 이후 가장 큰 폭의 금리 상승이 나왔고 성장주가 밀렸다.', 'ko').ok);
    t('올해 연도(2026년 9월) → 통과', validateInsight('2026년 9월 들어 10년물 금리가 가장 높은 수준을 기록했고 성장주가 밀렸다.', 'ko').ok);
    t('러셀 2000·2000억 은 연도가 아니다 → 통과', validateInsight('러셀 2000 지수가 1.2% 하락했고 2000억 달러 규모의 국채 입찰이 부담으로 작용했다.', 'ko').ok
        && validateInsight('The Russell 2000 fell 1.2% as a $2000 billion refunding weighed on small caps.', 'en').ok);
    t('ko 에 섞인 약어·티커는 비율에서 뺀다(XLK·IFS·GEX)', validateInsight('XLK, SMH, XLC IFS +28, HACK IFS +19, GEX +2, VIX 16.1 속에 기술주 기관 수급이 양수로 돌아섰다.', 'ko').ok);

    console.log('── ④ 생성 경로(모의 모델·모의 Upstash) — 나쁜 글은 절대 나가지 않는다');
    // S1: 저장본이 거절문 + 첫 생성도 거절문 → 교정 재시도가 정상 → 정상만 나가고 저장된다
    reset(MARKET);
    putStored('reality', 'ko', KO_REFUSAL, 1);
    script = [KO_REFUSAL, KO_REALITY_GOOD];
    let out = await IntelligenceNode.generateRealityInsight(ctxOf('ko'));
    t('S1 저장된 거절문은 읽을 때 거부 → 생성으로 간다', modelCalls[0] === 'Guardian/REALITY_ko', modelCalls.join(','));
    t('S1 거절 → 교정 재시도(1회)', modelCalls.length === 2 && modelCalls[1] === 'Guardian/REALITY_ko/retry', modelCalls.join(','));
    t('S1 결과 = 정상 한국어', out === cleanInsight(KO_REALITY_GOOD), out.slice(0, 60));
    t('S1 Redis 는 정상 글로 교체', getStored('reality', 'ko') === cleanInsight(KO_REALITY_GOOD));
    // 같은 인스턴스 재요청 — 메모리 적중, 모델 호출 없음
    modelCalls.length = 0;
    out = await IntelligenceNode.generateRealityInsight(ctxOf('ko'));
    t('S1 재요청은 메모리 적중(모델 호출 0)', modelCalls.length === 0 && out === cleanInsight(KO_REALITY_GOOD));

    // S2: 두 번 다 거절 → 마지막 정상본 없음 → 다른 언어(en) 정상본 번역
    reset(MARKET);
    putStored('reality', 'ko', KO_REFUSAL, 1);
    putStored('reality', 'en', EN_REALITY, 1);
    script = [KO_REFUSAL, KO_REFUSAL, KO_REALITY_GOOD];
    out = await IntelligenceNode.generateRealityInsight(ctxOf('ko'));
    t('S2 호출 순서 = 생성·재시도·번역(en→ko)', modelCalls.join(',') === 'Guardian/REALITY_ko,Guardian/REALITY_ko/retry,Translate/reality/en->ko', modelCalls.join(','));
    t('S2 결과 = 검사 통과한 번역', out === cleanInsight(KO_REALITY_GOOD), out.slice(0, 60));
    t('S2 Redis 는 번역본으로 교체(거절문 제거)', getStored('reality', 'ko') === cleanInsight(KO_REALITY_GOOD));

    // S3: 번역까지 영어로 옴 → 장중 대기 문구(한국어). 거절문으로 캐시를 덮지 않는다
    reset(MARKET);
    putStored('reality', 'ko', KO_REFUSAL, 1);
    putStored('reality', 'en', EN_REALITY, 1);
    script = [KO_REFUSAL, KO_REFUSAL, 'Here is the translation: Broad equity weakness observed as yields rose.'];
    out = await IntelligenceNode.generateRealityInsight(ctxOf('ko'));
    t('S3 결과 = 한국어 대기 문구(검사 통과)', IntelligenceNode.isPlaceholderInsight(out) && validateInsight(out, 'ko').ok && out.includes('준비'), out);
    t('S3 저장본을 나쁜 글로 덮지 않음', getStored('reality', 'ko') === KO_REFUSAL);
    // 쿨다운 — 곧바로 다시 불러도 모델을 두드리지 않는다
    modelCalls.length = 0;
    out = await IntelligenceNode.generateRealityInsight(ctxOf('ko'));
    t('S3 실패 쿨다운 중 재요청은 모델 호출 0', modelCalls.length === 0 && IntelligenceNode.isPlaceholderInsight(out), modelCalls.join(','));

    // S4: 장외 — 생성하지 않는다. 저장본 거절문 거부 → en 정상본 번역
    reset(NIGHT);
    putStored('reality', 'ko', KO_REFUSAL, 30);
    putStored('reality', 'en', EN_REALITY, 30);
    script = [KO_REALITY_GOOD];
    out = await IntelligenceNode.generateRealityInsight(ctxOf('ko'));
    t('S4 장외: 생성 호출 없이 번역만', modelCalls.join(',') === 'Translate/reality/en->ko', modelCalls.join(','));
    t('S4 장외 결과 = 번역본', out === cleanInsight(KO_REALITY_GOOD));

    // S5: 장외 + 쓸 글이 하나도 없음 → 장외 안내 문구(모델 호출 0)
    reset(NIGHT);
    putStored('reality', 'ko', KO_REFUSAL, 30);
    out = await IntelligenceNode.generateRealityInsight(ctxOf('ko'));
    t('S5 장외·원본 없음 → 한국어 장외 안내, 모델 호출 0', modelCalls.length === 0 && out.includes('장외 시간'), out);

    // S6: 장중 + 모델이 예외 → 영어 실패 문구 대신 대기 문구
    reset(MARKET);
    script = [new Error('ServiceUnavailableException')];
    out = await IntelligenceNode.generateGammaInsight(ctxOf('ja'));
    t('S6 모델 예외 → 일본어 대기 문구(«failed» 없음)', validateInsight(out, 'ja').ok && !/failed/i.test(out) && IntelligenceNode.isPlaceholderInsight(out), out);

    // S7: ja 생성이 마크다운 → 정리본이 나가고 저장된다
    reset(MARKET);
    script = [JA_REALITY_MD];
    out = await IntelligenceNode.generateRealityInsight(ctxOf('ja'));
    t('S7 ja 마크다운 생성 → 정리본(# · ** 없음)', out.startsWith('本日の米国市場は') && !/[#*]/.test(out), out.slice(0, 40));
    t('S7 재시도 없음(정리로 충분)', modelCalls.length === 1);

    // S8: ko 슬롯에 일본어가 두 번 → 번역 원본도 없음 → 대기 문구
    reset(MARKET);
    script = [JA_REALITY_MD, JA_REALITY_MD];
    out = await IntelligenceNode.generateRotationInsight(ctxOf('ko'));
    t('S8 ko 슬롯 일본어 2회 → 한국어 대기 문구', IntelligenceNode.isPlaceholderInsight(out) && validateInsight(out, 'ko').ok, out);

    console.log('── ⑤ 저장된 판정(ai_verdict·snapshot) 출구 검사');
    reset(NIGHT);
    putStored('reality', 'ko', KO_REALITY_GOOD, 60);
    const bad = { title: 'TACTICAL INSIGHT', description: KO_ROTATION_LEGACY, sentiment: 'NEUTRAL', realityInsight: KO_REFUSAL, gammaInsight: KO_GAMMA };
    const r1 = await IntelligenceNode.repairVerdictTexts(bad, 'ko', 'test');
    t('verdict: 거절문 칸만 교체(repaired=realityInsight)', r1.repaired.join(',') === 'realityInsight' && r1.changed, r1.repaired.join(','));
    t('verdict: 교체값 = 마지막 정상본', r1.verdict.realityInsight === cleanInsight(KO_REALITY_GOOD));
    t('verdict: 통과한 칸은 정리본(# 제거·레이블 줄 머리)', r1.verdict.description.startsWith('[현황]') && r1.verdict.gammaInsight.startsWith('[평소와 다른 점]'));
    const r2 = await IntelligenceNode.repairVerdictTexts(r1.verdict, 'ko', 'test');
    t('verdict: 두 번째 검사는 변경 없음(재저장 반복 없음)', !r2.changed && r2.repaired.length === 0);
    const kept = IntelligenceNode.keepRealTextOverPlaceholders(
        { description: 'x', realityInsight: '[진단] 최신 시장 분석을 준비하고 있습니다\n[결론] 잠시 후 자동으로 갱신됩니다', gammaInsight: 'y' },
        { description: 'x', realityInsight: KO_REALITY_GOOD, gammaInsight: 'y' }, 'ko');
    t('저장 시 대기 문구 칸은 직전 정상본 유지', kept.realityInsight === cleanInsight(KO_REALITY_GOOD));
    const notKept = IntelligenceNode.keepRealTextOverPlaceholders(
        { description: 'x', realityInsight: '[진단] 최신 시장 분석을 준비하고 있습니다\n[결론] 잠시 후 자동으로 갱신됩니다', gammaInsight: 'y' },
        { description: 'x', realityInsight: KO_REFUSAL, gammaInsight: 'y' }, 'ko');
    t('직전본이 나쁜 글이면 살리지 않는다', notKept.realityInsight.includes('준비'));

    console.log(`\n── 결과: 통과 ${passes} · 실패 ${fails}`);
    if (fails) process.exitCode = 1;
})().catch((e) => { console.error('테스트 자체 실패:', e); process.exitCode = 2; });
