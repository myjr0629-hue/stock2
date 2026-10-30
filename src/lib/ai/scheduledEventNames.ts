/**
 * ★2026-10-31 T35-A 예정 일정 이름의 한국어·일본어 표기 — «출구 검사 대조 전용»(화면·프롬프트에는 쓰지 않는다).
 *
 * 왜: 10/30 장중 ko·ja Tactical 의 NEXT 문장이 SCHEDULED_EVENTS 의 영어 이름(«CFTC Crude Oil speculative net positions»)을
 *   «CFTC 원유 투기적 순포지션»·«CFTCの原油投機筋ネットポジション»으로 옮겨 쓰자 일정 대조(scheduleClaimReasons)가 이름을 못 찾아
 *   schedule:claim-not-upcoming 으로 재생성마다 탈락 → ko 만 «준비 중»이 1시간 넘게 이어졌다(운영 로그 17:37Z~18:03Z).
 *
 * 계약(완화 아님):
 *   - 번역 표기가 «어느 일정»인지 사전으로 특정한 뒤, 기존과 똑같이 그 일정의 «앞으로 있을» 줄 하나가 날짜·시각을 모두 만족해야 한다.
 *   - 사전에 있는 표기인데 그 일정이 근거에 없거나 지났으면 실패(예: 근거엔 2년물 입찰만 있는데 «10년물 국채 입찰 예정»).
 *   - 표기 앞에 다른 명사가 붙으면(«청년 실업률»·«若年失業率»·«U-6 실업률» 중 U-6 를 뺀 매칭) 다른 지표로 보고 실패(fail-closed).
 *   - 표기 뒤에 기간·수정 수식어가 남으면(«실업률 전월비») 더 구체적인 다른 지표로 보고 실패 — 사전에 그 긴 표기가 있으면 그것으로 대조한다.
 *   - 같은 범위를 여러 일정이 똑같이 설명하면(«물가상승률» = Inflation Rate·MoM·YoY) 그중 하나라도 맞으면 된다(같은 발표 묶음).
 * 사전에 없는 이름은 예전처럼 대조 불가 → 탈락(새 이름은 운영 캘린더 전수 시험이 잡는다: tests/scheduledEventNames.test.ts).
 */

export interface EventNameHit {
    /** 글 속 위치(UTF-16) */
    start: number;
    end: number;
    text: string;
    /** false = 표기 앞뒤 수식어 때문에 «다른 지표»일 수 있어 대조하지 않는다(그 언급은 실패로 친다) */
    ok: boolean;
    why?: string;
    /** 근거 줄 이름(괄호 꼬리 뗀 본 이름)이 이 표기가 가리키는 일정인가 */
    test: (coreName: string) => boolean;
}

interface Entry { id: string; test: (core: string) => boolean; aliases: RegExp[]; gloss: string[] }

/** «Chicago PMI (Oct)» → «Chicago PMI» · «API Crude Oil Stock Change (Oct/30)» → «API Crude Oil Stock Change» */
export function eventCoreName(name: string): string {
    // 기간 꼬리: 괄호형(Tactical «(Sep)»·«(Oct/30)»·«(Q3)») · 괄호 없는 형(모닝 브리핑 줄 «New Home Sales Sep»)
    return String(name || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)(?:\/\d{1,2})?|Q[1-4])$/i, '').trim();
}

// ─── 기간 수식어 ───
const PERIOD: Record<'MoM' | 'YoY' | 'QoQ', string> = {
    MoM: '(?:전월\\s*(?:대비|비)|월간\\s*(?:변화|변동)?|MoM|m/m|前月比)',
    YoY: '(?:전년\\s*(?:동월\\s*|동기\\s*)?(?:대비|비)|YoY|y/y|前年(?:同月|同期)?比)',
    QoQ: '(?:전분기\\s*(?:대비|비)?|전기\\s*(?:대비|비)|분기\\s*(?:대비|비)?|QoQ|q/q|前期比|前四半期比)',
};
/**
 * 표기 «뒤»는 허용 목록으로만(관문 10310640·10310646 — «…순포지션의 미결제약정»·«실업률의 청년 수치»·«PMI의 신규주문»처럼 이어지는 말이 다른 값을 가리키면 실패):
 *   ① 문장 부호·괄호 닫힘·끝·영숫자 ② 붙은 조사·서술(«으로»·«이»·«입니다» — 꾸밈 «의»는 제외)
 *   ③ 띄운 낱말은 발표·지표·보고서·공시·자료·데이터·결과·일정·수치·예정(+조사)만 ④ 일본어는 (の)発表·公表·報告…(予定) + 조사, 또는 바로 문장 부호
 */
// 명사구를 끝내는 붙은 말(조사·서술) — 이 뒤는 새 절이라 보지 않는다. «의»는 꾸밈이라 다음 낱말까지 본다.
const KO_END = /^(?:으로|로|이|가|은|는|을|를|와|과|도|에|에서|에는|이며|이고|이다|입니다|인데|이나|이라|라는|으로서|로서|된|인|될|되는|이에요|예요)$/;
const KO_ALLOWED_NOUN = /^(?:발표|공개|공표|지표|보고서?|공시|자료|데이터|결과|일정|수치|예정|이벤트)/;
const JA_ALLOWED = /^(?:発表|公表|報告|統計|データ|指標|結果|資料|公示|予定)/;
const JA_END = /^(?:で|は|が|を|に|と|も|です|であり|となり|では|には)/;
const BOUNDARY = /^\s*(?:$|[,.!?;:)\]）」』、。·・…\-–—"'“”‘’A-Za-z0-9(（])/;
/**
 * 표기 «뒤»는 허용 목록으로만, 명사구가 끝날 때까지 이어 본다(관문 10310640·10310646·10310653):
 *   문장 부호·끝·영숫자 → 끝 · 붙은 조사·서술(«으로»·«이»·«입니다») → 끝 · «의» → 다음 낱말도 허용 낱말이어야
 *   띄운 낱말은 발표·지표·보고서·공시·자료·데이터·결과·일정·수치·예정(+조사)만 · 일본어는 (の)発表·公表…(予定)+조사, 공백 뒤 일본어도 같은 규칙
 */
function tailReason(after: string): string | null {
    let rest = after;
    for (let i = 0; i < 6; i++) {
        if (BOUNDARY.test(rest)) return null;
        const spaced = /^\s+/.test(rest);
        const t = rest.replace(/^\s+/, '');
        if (/^[가-힣]/.test(t)) {
            const word = t.match(/^[가-힣]+/)![0];
            if (!spaced) {   // 표기에 붙은 말
                if (KO_END.test(word)) return null;
                if (word === '의') { rest = t.slice(1); continue; }
                return `tail:${word}`;
            }
            const noun = word.match(KO_ALLOWED_NOUN)?.[0];
            if (!noun) return `tail:${word}`;
            const suffix = word.slice(noun.length);
            if (!suffix) { rest = t.slice(word.length); continue; }
            if (KO_END.test(suffix)) return null;
            if (suffix === '의') { rest = t.slice(word.length); continue; }
            return `tail:${word}`;
        }
        if (/^[ぁ-んァ-ヴー一-龯々]/.test(t)) {
            let u = t;
            if (u.startsWith('の')) u = u.slice(1);
            const noun = u.match(JA_ALLOWED)?.[0];
            if (noun) u = u.slice(noun.length);
            if (u.startsWith('予定')) u = u.slice(2);
            if (JA_END.test(u) || BOUNDARY.test(u)) return null;
            if (u.startsWith('の') && u !== t) { rest = u; continue; }
            return `tail:${t.slice(0, 6)}`;
        }
        return null;
    }
    return 'tail:too-long';
}
const PERIOD_ANY = new RegExp(`${PERIOD.MoM}|${PERIOD.YoY}|${PERIOD.QoQ}`, 'i');
/** 수준을 말하는 낱말 — 변화·비율 지표와 다른 값 */
const LEVEL_WORD = /지수|건수|수준|재고량|總量|총량|指数|件数|水準|在庫量/;
/** 변화·비율 지표(사전 항목 id 기준) */
const CHANGE_LIKE = /\b(?:MoM|YoY|QoQ)\b|Change$|\bRate(?: (?:MoM|YoY))?$/;
/** 표기 뒤에 남으면 «더 구체적인 다른 지표»로 보는 수식어(기간·잠정/확정·연율 등) */
const TRAILING_QUALIFIER = new RegExp(`^\\s*\\(?\\s*(?:${PERIOD.MoM}|${PERIOD.YoY}|${PERIOD.QoQ}|연율|연간\\s*환산|확정치?|예비치?|잠정치?|속보치?|수정치?|4\\s*주\\s*평균|速報値?|確報値?|改定値?|年率|4\\s*週(?:間)?\\s*平均)`, 'i');

/** 사람이 읽는 원본(공백 = 선택적 공백)을 정규식으로. 앞뒤가 영숫자이면 영숫자 경계를 붙인다. */
function rx(source: string): RegExp {
    const body = source.replace(/ /g, '\\s*');
    const head = /^[A-Za-z0-9]/.test(source) ? '(?<![A-Za-z0-9])' : '';
    const tail = /[A-Za-z0-9]$/.test(source) ? '(?![A-Za-z0-9])' : '';
    return new RegExp(`${head}(?:${body})${tail}`, 'giu');
}
const exact = (...keys: string[]) => {
    const set = new Set(keys.map(k => k.toLowerCase()));
    return (core: string) => set.has(core.toLowerCase());
};
/** 기간 지표 — 기본 표기 + (선택) 그 기간 수식어. 수식어가 다른 기간이면 이 항목은 기본 표기 범위까지만 맞는다. */
function periodic(period: keyof typeof PERIOD, ...bases: string[]): string[] {
    return bases.map(b => `(?:${b})(?: \\(? ${PERIOD[period]} \\)?)?`);
}
/** 기간 수식어가 «반드시» 있는 표기 — 같은 이름의 수준(기간 없는) 일정이 따로 있을 때(«주택 착공 건수» ≠ «주택 착공 전월비», 관문 10310550 ①) */
function periodicStrict(period: keyof typeof PERIOD, ...bases: string[]): string[] {
    return bases.map(b => `(?:${b}) \\(? ${PERIOD[period]} \\)?`);
}
function entry(id: string, test: (core: string) => boolean, ko: string[], ja: string[], gloss: string[]): Entry {
    return { id, test, aliases: [...ko, ...ja].map(rx), gloss };
}

// ─── 공통 조각 ───
const MICH_KO = '(?:미시간 ?대(?:학)? ?)?소비자 ?(?:심리|신뢰) ?지수|미시간 ?대(?:학)? ?(?:소비자 ?)?(?:심리|신뢰) ?지수';
const MICH_JA = '(?:ミシガン大学? ?)?消費者(?:信頼感|態度|心理)指数|ミシガン大学? ?(?:消費者)?(?:信頼感|態度|心理)指数';
const GDP_KO = '(?:미 )?(?:국내 ?총생산|GDP) ?(?:성장률)?';
const GDP_JA = '(?:米 )?(?:国内総生産|GDP) ?(?:成長率)?';
const CFTC_KO = '(?:CFTC (?:의 )?)?';
const CFTC_JA = '(?:CFTC (?:の )?)?';
// 순포지션만 — 매수·매도(롱·숏) 포지션은 다른 값(관문 10310624)
const SPEC_KO = '(?:투기(?:적| 세력| 거래자)?(?: 순)? 포지션|투기(?:적)? 순포지션|순 ?투기(?:적)? 포지션)';
const SPEC_JA = '(?:投機(?:筋|的)?(?:の )?(?:ネット|純)?(?:ポジション|持ち高))';
// «CFTC»가 앞에 붙은 자산이면 «(선물) 포지션»만으로도 그 주간 보고를 특정한다(실모델 10/31: «CFTC S&P 500 선물 포지션 공시»·«CFTC S&P500先物ポジション»)
const CFTC_LOOSE_KO = '(?:주간 )?(?:선물 )?(?:(?:투기(?:적)?|비상업) )?(?:순 ?)?포지션(?: (?:공시|자료|보고서?|데이터|지표|발표))?';
const CFTC_LOOSE_JA = '(?:週間 ?)?(?:先物 ?)?(?:投機筋 ?(?:の )?)?(?:ネット|純)?ポジション(?:公示|資料|報告|データ|統計)?';
const cftc = (core: string, koAsset: string, jaAsset: string, gloss: string[]): Entry =>
    entry(core, exact(core),
        [`${CFTC_KO}${koAsset} (?:의 )?${SPEC_KO}`, `CFTC (?:의 )?${koAsset} (?:의 )?${CFTC_LOOSE_KO}`],
        [`${CFTC_JA}${jaAsset} (?:の )?${SPEC_JA}`, `CFTC (?:の )?${jaAsset} (?:の )?${CFTC_LOOSE_JA}`], gloss);

// 연준 인사 — «Fed {이름} Speech»(직함 포함 변형도) · 같은 사람만
const FED_PEOPLE: Array<[string, string, string]> = [
    ['Powell', '파월', 'パウエル'], ['Jefferson', '제퍼슨', 'ジェファーソン'], ['Waller', '월러', 'ウォラー'], ['Bowman', '보(?:우)?먼', 'ボウマン'],
    ['Barr', '바(?=\\s*(?:연준|이사|부의장))', 'バー(?=\\s*(?:FRB|理事|副議長))'], ['Cook', '쿡', 'クック'], ['Kugler', '쿠글러', 'クーグラー'], ['Miran', '미란', 'ミラン'],
    ['Daly', '데일리', 'デイリー'], ['Barkin', '바킨', 'バーキン'], ['Musalem', '무살렘', 'ムサレム'], ['Goolsbee', '굴스비', 'グールズビー'],
    ['Hammack', '(?:해맥|해먹|하맥)', 'ハマック'], ['Logan', '로건', 'ローガン'], ['Williams', '윌리엄스', 'ウィリアムズ'], ['Kashkari', '카(?:시|슈)카리', 'カシュカリ'],
    ['Bostic', '보스틱', 'ボスティック'], ['Collins', '콜린스', 'コリンズ'], ['Schmid', '슈미(?:드|트)', 'シュミッド'], ['Harker', '하커', 'ハーカー'],
    ['Paulson', '폴슨', 'ポールソン'], ['Mester', '메스터', 'メスター'],
];
const FED_SPEECH = /^Fed (?:Chair(?:man)? |Vice Chair(?: for Supervision)? |Governor |President )?([A-Z][a-z]+) (?:Speech|Speaks|Testimony|Remarks)$/;
const KO_FED_PREFIX = '(?:(?:미 )?(?:연준|연방준비제도|연방준비은행|연은) (?:의 )?)?(?:[가-힣]{1,8} (?:연은|연방준비은행) )?';
const KO_FED_TITLE = '(?:(?:연준|연은) )?(?:총재|이사|부의장|의장|위원)?';
const JA_FED_PREFIX = '(?:(?:米 )?(?:FRB|連銀|米連邦準備制度理事会|米連邦準備銀行) (?:の )?)?(?:[ァ-ヴー・]{1,10} 連銀 (?:の )?)?';
/** 이름 뒤에 붙는 소속 연은(«데일리 샌프란시스코 연은 총재»·«デイリー・サンフランシスコ連銀総裁») */
const KO_FED_BANK = '(?:[가-힣]{1,8} (?:연은|연방준비은행) )?';
const JA_FED_BANK = '(?:・? ?[ァ-ヴー]{1,10} 連銀 )?';
const JA_FED_TITLE = '(?:(?:米)?(?:FRB|連銀) )?(?:総裁|理事|副議長|議長)?';
// 연설(Speech·Speaks·Remarks) ≠ 증언(Testimony) — 같은 사람이어도 종류가 맞아야(관문 10310619)
const FED_KINDS = [
    { id: 'Speech', en: /^(?:Speech|Speaks|Remarks)$/, ko: '(?:연설|발언|강연)', ja: '(?:講演|発言|演説)' },
    { id: 'Testimony', en: /^Testimony$/, ko: '(?:의회 )?증언', ja: '(?:議会 ?)?証言' },
];
const fedPeople = FED_PEOPLE.flatMap(([en, ko, ja]) => FED_KINDS.map(k => entry(`Fed ${en} ${k.id}`,
    core => { const m = FED_SPEECH.exec(core); return m?.[1] === en && k.en.test(core.split(' ').pop() || ''); },
    [`${KO_FED_PREFIX}${ko} ${KO_FED_BANK}${KO_FED_TITLE} (?:의 )?${k.ko}`],
    [`${JA_FED_PREFIX}${ja} ${JA_FED_BANK}${JA_FED_TITLE} (?:の )?${k.ja}`],
    ['연준 연설', '連銀講演', 'FRB講演'])));
/** 사전에 없는 인물의 «○○ 총재 연설»은 어느 줄로도 맞지 않는다(사건군 «연준»만으로 다른 인사의 줄에 기대 통과하지 않게) */
const fedUnknownPerson = entry('Fed unknown person speech', () => false,
    [`(?<![가-힣])(?!(?:미국|연준|연은|연방|다음|예정)(?![가-힣]))[가-힣]{2,6} ${KO_FED_BANK}(?:(?:연준|연은) )?(?:총재|이사|부의장|의장) (?:의 )?(?:연설|발언|강연|증언)`],
    [`(?<![ァ-ヴー])[ァ-ヴー]{2,10} ${JA_FED_BANK}(?:(?:米)?(?:FRB|連銀) )?(?:総裁|理事|副議長|議長) (?:の )?(?:講演|発言|演説|証言)`], []);

// 미 국채 입찰 — 만기·단위·종류(명목/물가연동)가 모두 같아야 한다
const AUCTION = /^(\d+)-(Year|Month|Week) (Note|Bond|Bill|TIPS|FRN) Auction$/i;
const KO_UNIT: Record<string, string> = { year: '년', month: '개월', week: '주' };
const JA_UNIT: Record<string, string> = { year: '年', month: '(?:か月|カ月|ヶ月|ヵ月)', week: '週' };
const AUCTION_TERMS = [[2, 'year'], [3, 'year'], [5, 'year'], [7, 'year'], [10, 'year'], [20, 'year'], [30, 'year'], [4, 'week'], [6, 'week'], [8, 'week'], [13, 'week'], [17, 'week'], [26, 'week'], [52, 'week'], [3, 'month'], [6, 'month']] as const;
/**
 * 입찰 종류 — 줄의 종류(Note·Bond·Bill·TIPS·FRN)와 표기의 종류가 맞아야 한다(관문 10310602 «2년물 T-노트» ↔ «2-Year FRN»).
 *   «국채»·«재무부 채권/증권»처럼 종류를 말하지 않는 표기는 명목 국채(Note·Bond·Bill) 어느 것이든, TIPS·FRN 은 그 이름을 써야만.
 */
const AUCTION_KINDS: Array<{ id: string; types: string[]; ko: string; ja: string }> = [
    { id: 'nominal', types: ['NOTE', 'BOND', 'BILL'], ko: '(?:국채|재무부 (?:채권|증권))', ja: '(?:国債|財務省証券)' },
    { id: 'note', types: ['NOTE'], ko: '(?:T-?노트|중기채|중기 국채|재무부 중기채)', ja: '(?:中期国債|Tノート)' },
    { id: 'bond', types: ['BOND'], ko: '(?:T-?본드|장기채|장기 국채|재무부 장기채)', ja: '(?:長期国債|Tボンド)' },
    { id: 'bill', types: ['BILL'], ko: '(?:T-?빌|단기채|단기 국채|재무부 단기채|재무부 단기 ?증권)', ja: '(?:短期国債|財務省短期証券|短期証券|Tビル)' },
    { id: 'tips', types: ['TIPS'], ko: '(?:물가 ?연동 (?:국채)?|TIPS)', ja: '(?:物価連動国債|TIPS)' },
    { id: 'frn', types: ['FRN'], ko: '(?:변동 ?금리 (?:국채|채권)?|FRN)', ja: '(?:変動利付(?:国)?債|FRN)' },
];
const auctions = AUCTION_TERMS.flatMap(([n, unit]) => AUCTION_KINDS.map(kind => entry(`${n}-${unit} ${kind.id} auction`,
    core => { const m = AUCTION.exec(core); return !!m && Number(m[1]) === n && m[2].toLowerCase() === unit && kind.types.includes(m[3].toUpperCase()); },
    [`${n} ${KO_UNIT[unit]}(?:물|만기)? (?:미 )?${kind.ko} (?:의 )?입찰`],
    [`${n} ${JA_UNIT[unit]}(?:物)? (?:米)?${kind.ja} (?:の )?入札`],
    ['국채 입찰', '国債入札'])));
/** 사전에 없는 만기(«12년물»)·종류의 입찰은 어느 줄로도 맞지 않는다(사건군 «국채 입찰»만으로 다른 만기 줄에 기대 통과하지 않게) */
const auctionUnknownTerm = entry('unknown-term auction', () => false,
    [`\\d+ (?:년|개월|주)(?:물|만기)? (?:미 )?(?:${AUCTION_KINDS.map(k => k.ko).join('|')}) (?:의 )?입찰`],
    [`\\d+ (?:年|か月|カ月|ヶ月|ヵ月|週)(?:物)? (?:米)?(?:${AUCTION_KINDS.map(k => k.ja).join('|')}) (?:の )?入札`], []);

const ENTRIES: Entry[] = [
    // ── CFTC 주간 포지션 ──
    cftc('CFTC Crude Oil speculative net positions', '(?:WTI )?원유', '(?:WTI )?原油', ['원유 투기 포지션', '原油投機筋ポジション']),
    cftc('CFTC Gold Speculative net positions', '금', '金', ['금 투기 포지션', '金投機筋ポジション']),
    cftc('CFTC Nasdaq 100 speculative net positions', '나스닥 ?100', 'ナスダック ?100', ['나스닥100 투기 포지션', 'ナスダック100投機筋ポジション']),
    cftc('CFTC S&P 500 speculative net positions', 'S&P ?500', 'S&P ?500', ['S&P500 투기 포지션', 'S&P500投機筋ポジション']),
    // ── 에너지 재고·시추 ──
    entry('EIA Crude Oil Stocks Change', exact('EIA Crude Oil Stocks Change'),
        ['EIA (?:의 )?(?:주간 )?원유 재고(?: (?:변화|변동|증감|량|지표|발표))?'], ['EIA (?:の )?(?:週間 )?原油在庫(?: (?:変動|変化|増減|量|統計))?'], ['원유 재고', '原油在庫']),
    entry('EIA Gasoline Stocks Change', exact('EIA Gasoline Stocks Change'),
        ['EIA (?:의 )?(?:주간 )?(?:휘발유|가솔린) 재고(?: (?:변화|변동|증감|량))?'], ['EIA (?:の )?(?:週間 )?ガソリン在庫(?: (?:変動|変化|増減|量))?'], ['휘발유 재고', 'ガソリン在庫']),
    entry('EIA Distillate Stocks Change', exact('EIA Distillate Stocks Change'),
        ['EIA (?:의 )?(?:주간 )?(?:정제유|증류유) 재고(?: (?:변화|변동|증감|량))?'], ['EIA (?:の )?(?:週間 )?留出油在庫(?: (?:変動|変化|増減|量))?'], ['정제유 재고', '留出油在庫']),
    entry('EIA Natural Gas Stocks Change', exact('EIA Natural Gas Stocks Change'),
        ['EIA (?:의 )?(?:주간 )?천연 ?가스 재고(?: (?:변화|변동|증감|량))?'], ['EIA (?:の )?(?:週間 )?天然ガス在庫(?: (?:変動|変化|増減|量))?'], ['천연가스 재고', '天然ガス在庫']),
    entry('EIA Cushing Crude Oil Stocks Change', exact('EIA Cushing Crude Oil Stocks Change'),
        ['EIA (?:의 )?쿠싱 (?:원유 )?재고(?: (?:변화|변동|증감|량))?'], ['EIA (?:の )?クッシング(?:原油)?在庫(?: (?:変動|変化|増減|量))?'], ['쿠싱 원유 재고', 'クッシング原油在庫']),
    entry('API Crude Oil Stock Change', exact('API Crude Oil Stock Change'),
        ['API (?:의 )?(?:주간 )?원유 재고(?: (?:변화|변동|증감|량|지표|발표))?'], ['API (?:の )?(?:週間 )?原油在庫(?: (?:変動|変化|増減|量|統計))?'], ['원유 재고', '原油在庫']),
    entry('Baker Hughes Oil Rig Count', exact('Baker Hughes Oil Rig Count', 'Baker Hughes Crude Oil Rigs'),
        ['베이커 ?휴즈 (?:의 )?(?:원유|석유) (?:시추 )?(?:리그|굴착 ?장비|채굴 ?장비|시추기)(?: (?:수|가동 ?수|카운트))?'], ['ベーカー・?ヒューズ (?:の )?(?:石油|原油) ?(?:掘削)?リグ(?:稼働)?数'], ['베이커휴즈 시추 리그', 'ベーカー・ヒューズ リグ数']),
    entry('Baker Hughes Total Rig Count', exact('Baker Hughes Total Rig Count', 'Baker Hughes Total Rigs'),
        ['베이커 ?휴즈 (?:의 )?(?:전체|총) (?:시추 )?(?:리그|굴착 ?장비|채굴 ?장비|시추기)(?: (?:수|가동 ?수|카운트))?'], ['ベーカー・?ヒューズ (?:の )?(?:総|全体の?) ?(?:掘削)?リグ(?:稼働)?数'], ['베이커휴즈 시추 리그', 'ベーカー・ヒューズ リグ数']),
    // ── 고용 ──
    entry('Non Farm Payrolls', exact('Non Farm Payrolls', 'Nonfarm Payrolls'),
        ['(?:미 )?비농업 (?:부문 )?(?:고용(?:자 ?수| 지표| 보고서)?|일자리 ?(?:수|증가)?|취업자 ?(?:수)?)'], ['(?:米 )?非農業部門雇用者数(?:変化)?'], ['비농업 고용', '고용지표', '非農業部門雇用者数', '雇用統計']),
    entry('Nonfarm Payrolls Private', exact('Nonfarm Payrolls Private', 'Non Farm Payrolls Private'),
        ['민간 (?:부문 )?비농업 (?:부문 )?(?:고용(?:자 ?수)?|일자리 ?(?:수)?)'], ['民間 ?非農業部門雇用者数'], ['민간 비농업 고용', '民間非農業部門雇用者数', '雇用統計']),
    entry('Unemployment Rate', exact('Unemployment Rate'), ['(?:미 )?실업률'], ['(?:米 )?失業率'], ['실업률', '失業率', '雇用統計']),
    entry('U-6 Unemployment Rate', exact('U-6 Unemployment Rate'), ['U-?6 (?:광의 )?실업률'], ['U-?6 (?:広義の? ?)?失業率'], ['U-6 실업률', 'U-6失業率']),
    entry('Participation Rate', exact('Participation Rate'), ['경제 ?활동 ?참가율|노동 ?참여율'], ['労働参加率'], ['경제활동참가율', '労働参加率']),
    entry('Average Hourly Earnings MoM', exact('Average Hourly Earnings MoM'), periodic('MoM', '평균 ?시간당 ?(?:임금|소득)'), periodic('MoM', '平均時給'), ['평균 시간당 임금', '平均時給']),
    entry('Average Hourly Earnings YoY', exact('Average Hourly Earnings YoY'), periodic('YoY', '평균 ?시간당 ?(?:임금|소득)'), periodic('YoY', '平均時給'), ['평균 시간당 임금', '平均時給']),
    entry('ADP Employment Change', exact('ADP Employment Change'),
        ['ADP (?:민간 )?(?:고용(?:자 ?수)?(?: (?:변화|증감|변동|보고서|지표))?|취업자 ?수(?: (?:변화|증감))?)'], ['ADP (?:民間 ?)?雇用(?:者数|統計|報告)?(?:変化|変動)?'], ['ADP 고용', 'ADP雇用統計']),
    entry('Initial Jobless Claims', exact('Initial Jobless Claims'),
        ['(?:주간 )?(?:신규 )?실업 ?수당 ?(?:신규 )?(?:청구 ?(?:건수|자 ?수)?|신청 ?(?:건수|자 ?수)?)'], ['(?:週間 ?)?新規失業保険(?:申請|請求)件数'], ['신규 실업수당 청구', '新規失業保険申請件数']),
    entry('Continuing Jobless Claims', exact('Continuing Jobless Claims'),
        ['(?:계속|연속|지속) ?실업 ?수당 ?(?:청구|수급|신청) ?(?:건수|자 ?수)?'], ['継続 ?(?:失業保険|受給者) ?(?:申請|受給)?(?:件数|者数)'], ['계속 실업수당 청구', '継続失業保険申請件数']),
    entry('Jobless Claims 4-Week Average', exact('Jobless Claims 4-Week Average'),
        ['실업 ?수당 ?(?:신규 )?(?:청구|신청) ?(?:건수)? ?4 ?주 ?(?:이동 ?)?평균'], ['失業保険申請件数 ?4 ?週(?:間)? ?(?:移動)?平均'], ['실업수당 청구 4주 평균', '失業保険申請件数4週平均']),
    entry('JOLTs Job Openings', exact('JOLTs Job Openings', 'JOLTS Job Openings'),
        ['(?:JOLTS )?(?:구인 ?(?:건수|이직 ?보고서|공고 ?수|규모)|일자리 ?공고 ?(?:수|건수))'], ['(?:JOLTS )?求人(?:件数|数)'], ['구인 건수', '求人件数']),
    entry('Employment Cost Index QoQ', exact('Employment Cost Index QoQ'), periodic('QoQ', '고용 ?비용 ?지수|고용 ?비용'), periodic('QoQ', '雇用(?:コスト|費用)指数'), ['고용비용지수', '雇用コスト指数']),
    entry('Employment Cost - Wages QoQ', exact('Employment Cost - Wages QoQ'), periodic('QoQ', '고용 ?비용 ?(?:중 )?(?:임금|급여)'), periodic('QoQ', '雇用(?:コスト|費用) ?(?:・ ?)?賃金'), ['고용비용 임금', '雇用コスト賃金']),
    entry('Employment Cost - Benefits QoQ', exact('Employment Cost - Benefits QoQ'), periodic('QoQ', '고용 ?비용 ?(?:중 )?(?:복리 ?후생|수당)'), periodic('QoQ', '雇用(?:コスト|費用) ?(?:・ ?)?福利厚生'), ['고용비용 복리후생', '雇用コスト福利厚生']),
    entry('Nonfarm Productivity QoQ', exact('Nonfarm Productivity QoQ'), periodic('QoQ', '비농업 (?:부문 )?(?:노동 )?생산성'), periodic('QoQ', '非農業部門 ?労働生産性'), ['비농업 생산성', '非農業部門労働生産性']),
    entry('Unit Labour Costs QoQ', exact('Unit Labour Costs QoQ', 'Unit Labor Costs QoQ'), periodic('QoQ', '단위 ?노동 ?비용'), periodic('QoQ', '単位労働コスト'), ['단위노동비용', '単位労働コスト']),
    entry('Challenger Job Cuts', exact('Challenger Job Cuts'), ['챌린저 (?:기업 )?(?:감원|해고|인원 ?감축)(?: (?:건수|규모|발표|보고서))?'], ['チャレンジャー ?(?:人員削減|解雇)(?:数|発表)?'], ['챌린저 감원', 'チャレンジャー人員削減']),
    // ── 물가 ──
    entry('Inflation Rate', exact('Inflation Rate'), ['(?:미 )?(?:소비자 ?)?물가 ?(?:상승률|지수)|(?:미 )?인플레이션(?: ?율)?|(?:미 )?CPI'], ['(?:米 )?(?:インフレ率|消費者物価(?:指数)?|CPI)'], ['소비자물가', '물가상승률', '消費者物価', 'インフレ率']),
    entry('Inflation Rate MoM', exact('Inflation Rate MoM'), periodicStrict('MoM', '(?:미 )?(?:소비자 ?)?물가 ?(?:상승률|지수)|(?:미 )?인플레이션(?: ?율)?|(?:미 )?CPI'), periodicStrict('MoM', '(?:米 )?(?:インフレ率|消費者物価(?:指数)?|CPI)'), ['소비자물가', '물가상승률', '消費者物価', 'インフレ率']),
    entry('Inflation Rate YoY', exact('Inflation Rate YoY'), periodicStrict('YoY', '(?:미 )?(?:소비자 ?)?물가 ?(?:상승률|지수)|(?:미 )?인플레이션(?: ?율)?|(?:미 )?CPI'), periodicStrict('YoY', '(?:米 )?(?:インフレ率|消費者物価(?:指数)?|CPI)'), ['소비자물가', '물가상승률', '消費者物価', 'インフレ率']),
    entry('CPI s.a', exact('CPI s.a', 'CPI'), ['(?:계절 ?조정 )?(?:소비자 ?물가 ?지수|CPI)(?: \\(?계절 ?조정\\)?)?'], ['(?:季節調整済み? ?)?(?:消費者物価指数|CPI)'], ['소비자물가지수', '消費者物価指数']),
    entry('Core Inflation Rate MoM', exact('Core Inflation Rate MoM', 'Core CPI MoM'), periodic('MoM', '근원 ?(?:소비자 ?)?(?:물가 ?(?:상승률|지수)?|인플레이션(?: ?율)?|CPI)'), periodic('MoM', 'コア ?(?:インフレ率|消費者物価(?:指数)?|CPI)'), ['근원 소비자물가', 'コア消費者物価']),
    entry('Core Inflation Rate YoY', exact('Core Inflation Rate YoY', 'Core CPI YoY'), periodic('YoY', '근원 ?(?:소비자 ?)?(?:물가 ?(?:상승률|지수)?|인플레이션(?: ?율)?|CPI)'), periodic('YoY', 'コア ?(?:インフレ率|消費者物価(?:指数)?|CPI)'), ['근원 소비자물가', 'コア消費者物価']),
    entry('Producer Price Index MoM', exact('Producer Price Index MoM', 'PPI MoM'), periodic('MoM', '(?:미 )?생산자 ?물가(?: ?(?:지수|상승률))?|(?:미 )?PPI'), periodic('MoM', '(?:米 )?(?:生産者物価(?:指数)?|PPI)'), ['생산자물가', '生産者物価']),
    entry('Producer Price Index YoY', exact('Producer Price Index YoY', 'PPI YoY'), periodic('YoY', '(?:미 )?생산자 ?물가(?: ?(?:지수|상승률))?|(?:미 )?PPI'), periodic('YoY', '(?:米 )?(?:生産者物価(?:指数)?|PPI)'), ['생산자물가', '生産者物価']),
    entry('Core PPI MoM', exact('Core PPI MoM'), periodic('MoM', '근원 ?(?:생산자 ?물가(?: ?(?:지수|상승률))?|PPI)'), periodic('MoM', 'コア ?(?:生産者物価(?:指数)?|PPI)'), ['근원 생산자물가', 'コア生産者物価']),
    entry('Core PPI YoY', exact('Core PPI YoY'), periodic('YoY', '근원 ?(?:생산자 ?물가(?: ?(?:지수|상승률))?|PPI)'), periodic('YoY', 'コア ?(?:生産者物価(?:指数)?|PPI)'), ['근원 생산자물가', 'コア生産者物価']),
    entry('PCE Price Index MoM', exact('PCE Price Index MoM'), periodic('MoM', '(?:미 )?(?:개인 ?소비 ?지출 ?\\(?PCE\\)? ?|PCE ?)(?:물가 ?(?:지수)?|가격 ?지수)'), periodic('MoM', '(?:米 )?(?:個人消費支出 ?\\(?PCE\\)? ?|PCE ?)(?:物価|価格)指数'), ['개인소비지출 물가', 'PCE 물가', '個人消費支出物価', 'PCE価格指数']),
    entry('PCE Price Index YoY', exact('PCE Price Index YoY'), periodic('YoY', '(?:미 )?(?:개인 ?소비 ?지출 ?\\(?PCE\\)? ?|PCE ?)(?:물가 ?(?:지수)?|가격 ?지수)'), periodic('YoY', '(?:米 )?(?:個人消費支出 ?\\(?PCE\\)? ?|PCE ?)(?:物価|価格)指数'), ['개인소비지출 물가', 'PCE 물가', '個人消費支出物価', 'PCE価格指数']),
    entry('Core PCE Price Index MoM', exact('Core PCE Price Index MoM'), periodic('MoM', '근원 ?(?:개인 ?소비 ?지출 ?\\(?PCE\\)? ?|PCE ?)(?:물가 ?(?:지수)?|가격 ?지수)'), periodic('MoM', 'コア ?(?:個人消費支出 ?\\(?PCE\\)? ?|PCE ?)(?:物価|価格)?指数'), ['근원 PCE 물가', 'コアPCE価格指数']),
    entry('Core PCE Price Index YoY', exact('Core PCE Price Index YoY'), periodic('YoY', '근원 ?(?:개인 ?소비 ?지출 ?\\(?PCE\\)? ?|PCE ?)(?:물가 ?(?:지수)?|가격 ?지수)'), periodic('YoY', 'コア ?(?:個人消費支出 ?\\(?PCE\\)? ?|PCE ?)(?:物価|価格)?指数'), ['근원 PCE 물가', 'コアPCE価格指数']),
    entry('Export Prices MoM', exact('Export Prices MoM'), periodic('MoM', '수출 ?(?:물가|가격)(?: ?지수)?'), periodic('MoM', '輸出物価(?:指数)?'), ['수출물가', '輸出物価']),
    entry('Import Prices MoM', exact('Import Prices MoM'), periodic('MoM', '수입 ?(?:물가|가격)(?: ?지수)?'), periodic('MoM', '輸入物価(?:指数)?'), ['수입물가', '輸入物価']),
    // ── 소비·생산·기업 ──
    entry('Retail Sales MoM', exact('Retail Sales MoM'), periodic('MoM', '(?:미 )?소매 ?판매'), periodic('MoM', '(?:米 )?小売売上高'), ['소매판매', '小売売上高']),
    entry('Retail Sales YoY', exact('Retail Sales YoY'), periodic('YoY', '(?:미 )?소매 ?판매'), periodic('YoY', '(?:米 )?小売売上高'), ['소매판매', '小売売上高']),
    entry('Retail Sales Ex Autos MoM', exact('Retail Sales Ex Autos MoM'), periodic('MoM', '자동차 ?(?:를 )?제외(?:한)? ?(?:근원 )?소매 ?판매|근원 ?소매 ?판매'), periodic('MoM', '自動車(?:を)?除く ?小売売上高|コア小売売上高'), ['자동차 제외 소매판매', '自動車除く小売売上高']),
    entry('Retail Sales Control Group MoM', exact('Retail Sales Control Group MoM'), periodic('MoM', '소매 ?판매 ?(?:통제 ?(?:그룹|군)|컨트롤 ?그룹)'), periodic('MoM', '小売売上高 ?(?:コントロールグループ|制御グループ)'), ['소매판매 통제그룹', '小売売上高コントロールグループ']),
    entry('Retail Inventories Ex Autos MoM', exact('Retail Inventories Ex Autos MoM'), periodic('MoM', '자동차 ?제외(?:한)? ?소매 ?재고'), periodic('MoM', '自動車(?:を)?除く ?小売在庫'), ['자동차 제외 소매재고', '自動車除く小売在庫']),
    entry('Wholesale Inventories MoM', exact('Wholesale Inventories MoM'), periodic('MoM', '도매 ?재고'), periodic('MoM', '卸売在庫'), ['도매재고', '卸売在庫']),
    entry('Business Inventories MoM', exact('Business Inventories MoM'), periodic('MoM', '기업 ?재고'), periodic('MoM', '企業在庫'), ['기업재고', '企業在庫']),
    entry('Personal Spending MoM', exact('Personal Spending MoM'), periodic('MoM', '개인 ?(?:소비 ?)?지출'), periodic('MoM', '個人(?:消費)?支出'), ['개인지출', '個人支出']),
    entry('Personal Income MoM', exact('Personal Income MoM'), periodic('MoM', '개인 ?소득'), periodic('MoM', '個人所得'), ['개인소득', '個人所得']),
    entry('Industrial Production MoM', exact('Industrial Production MoM'), periodic('MoM', '(?:미 )?산업 ?생산'), periodic('MoM', '(?:米 )?鉱工業生産'), ['산업생산', '鉱工業生産']),
    entry('Capacity Utilization', exact('Capacity Utilization'), ['(?:설비 ?)?가동률'], ['設備稼働率'], ['설비가동률', '設備稼働率']),
    entry('Durable Goods Orders MoM', exact('Durable Goods Orders MoM'), periodic('MoM', '(?:미 )?내구재 ?(?:주문|수주)'), periodic('MoM', '(?:米 )?耐久財受注'), ['내구재 주문', '耐久財受注']),
    entry('Durable Goods Orders Ex Transp MoM', exact('Durable Goods Orders Ex Transp MoM'), periodic('MoM', '(?:운송 ?(?:장비 ?)?|수송 ?(?:기기 ?)?)(?:를 )?제외(?:한)? ?내구재 ?(?:주문|수주)'), periodic('MoM', '輸送(?:機器|用機器)(?:を)?除く ?耐久財受注'), ['운송 제외 내구재 주문', '輸送機器除く耐久財受注']),
    entry('Factory Orders MoM', exact('Factory Orders MoM'), periodic('MoM', '(?:공장|제조업) ?(?:주문|수주)'), periodic('MoM', '製造業受注|工場受注'), ['공장주문', '製造業受注']),
    entry('Corporate Profits QoQ', exact('Corporate Profits QoQ'), periodic('QoQ', '기업 ?(?:이익|수익)'), periodic('QoQ', '企業利益'), ['기업이익', '企業利益']),
    entry('Construction Spending MoM', exact('Construction Spending MoM'), periodic('MoM', '건설 ?(?:지출|투자)'), periodic('MoM', '建設支出'), ['건설지출', '建設支出']),
    // ── 서베이·지수 ──
    entry('ISM Manufacturing PMI', exact('ISM Manufacturing PMI'), ['ISM (?:의 )?제조업 ?(?:구매 ?관리자 ?지수|PMI|지수|경기 ?지수)'], ['ISM (?:の )?製造業 ?(?:景況(?:感)?指数|購買担当者景気指数|PMI)'], ['ISM 제조업 PMI', '구매관리자', 'ISM製造業景況指数', '購買担当者']),
    entry('ISM Manufacturing Employment', exact('ISM Manufacturing Employment'), ['ISM (?:의 )?제조업 ?(?:PMI ?)?고용(?: ?지수)?'], ['ISM (?:の )?製造業 ?雇用(?:指数)?'], ['ISM 제조업 고용', 'ISM製造業雇用']),
    entry('ISM Manufacturing Prices', exact('ISM Manufacturing Prices', 'ISM Manufacturing Prices Paid'), ['ISM (?:의 )?제조업 ?(?:PMI ?)?(?:가격|물가)(?: ?지수)?'], ['ISM (?:の )?製造業 ?価格(?:指数)?'], ['ISM 제조업 가격', 'ISM製造業価格']),
    entry('ISM Manufacturing New Orders', exact('ISM Manufacturing New Orders'), ['ISM (?:의 )?제조업 ?(?:PMI ?)?신규 ?주문(?: ?지수)?'], ['ISM (?:の )?製造業 ?新規受注(?:指数)?'], ['ISM 제조업 신규주문', 'ISM製造業新規受注']),
    entry('ISM Services PMI', exact('ISM Services PMI', 'ISM Non-Manufacturing PMI'), ['ISM (?:의 )?(?:서비스업|비제조업) ?(?:구매 ?관리자 ?지수|PMI|지수|경기 ?지수)'], ['ISM (?:の )?(?:非製造業|サービス業) ?(?:景況(?:感)?指数|購買担当者景気指数|PMI)'], ['ISM 서비스업 PMI', '구매관리자', 'ISM非製造業景況指数', '購買担当者']),
    entry('ISM Services Prices', exact('ISM Services Prices', 'ISM Services Prices Paid'), ['ISM (?:의 )?(?:서비스업|비제조업) ?(?:PMI ?)?(?:가격|물가)(?: ?지수)?'], ['ISM (?:の )?(?:非製造業|サービス業) ?価格(?:指数)?'], ['ISM 서비스업 가격', 'ISM非製造業価格']),
    entry('ISM Services Employment', exact('ISM Services Employment'), ['ISM (?:의 )?(?:서비스업|비제조업) ?(?:PMI ?)?고용(?: ?지수)?'], ['ISM (?:の )?(?:非製造業|サービス業) ?雇用(?:指数)?'], ['ISM 서비스업 고용', 'ISM非製造業雇用']),
    entry('S&P Global Manufacturing PMI', exact('S&P Global Manufacturing PMI'), ['S&P ?글로벌 (?:미 )?제조업 ?(?:구매 ?관리자 ?지수|PMI)'], ['S&P ?グローバル (?:米 )?製造業 ?(?:購買担当者景気指数|PMI)'], ['S&P 글로벌 제조업 PMI', '구매관리자', 'S&Pグローバル製造業PMI', '購買担当者']),
    entry('S&P Global Services PMI', exact('S&P Global Services PMI'), ['S&P ?글로벌 (?:미 )?서비스업 ?(?:구매 ?관리자 ?지수|PMI)'], ['S&P ?グローバル (?:米 )?サービス業 ?(?:購買担当者景気指数|PMI)'], ['S&P 글로벌 서비스업 PMI', '구매관리자', 'S&PグローバルサービスPMI', '購買担当者']),
    entry('S&P Global Composite PMI', exact('S&P Global Composite PMI'), ['S&P ?글로벌 (?:미 )?종합 ?(?:구매 ?관리자 ?지수|PMI)'], ['S&P ?グローバル (?:米 )?総合 ?(?:購買担当者景気指数|PMI)'], ['S&P 글로벌 종합 PMI', '구매관리자', 'S&Pグローバル総合PMI', '購買担当者']),
    entry('Chicago PMI', exact('Chicago PMI'), ['시카고 ?(?:구매 ?관리자 ?지수|PMI)'], ['シカゴ ?(?:購買部協会景気指数|購買担当者景気指数|PMI)'], ['시카고 PMI', '구매관리자', 'シカゴPMI', '購買担当者']),
    entry('Michigan Consumer Sentiment Prel', exact('Michigan Consumer Sentiment Prel'), [`(?:${MICH_KO}) (?:\\(? ?)?(?:예비치?|잠정치?|속보치?)(?: ?\\))?`], [`(?:${MICH_JA}) (?:\\(? ?)?(?:速報値?|予備値?)(?: ?\\))?`], ['소비자심리지수', 'ミシガン大学消費者信頼感指数']),
    entry('Michigan Consumer Sentiment Final', exact('Michigan Consumer Sentiment Final'), [`(?:${MICH_KO}) (?:\\(? ?)?확정치?(?: ?\\))?`], [`(?:${MICH_JA}) (?:\\(? ?)?(?:確報値?|確定値?)(?: ?\\))?`], ['소비자심리지수', 'ミシガン大学消費者信頼感指数']),
    entry('Michigan Consumer Sentiment', exact('Michigan Consumer Sentiment', 'Michigan Consumer Sentiment Prel', 'Michigan Consumer Sentiment Final'),
        ['(?:미시간 ?대(?:학)? ?)?소비자 ?(?:심리|신뢰) ?지수(?: \\(?미시간 ?대(?:학)?\\)?)?|미시간 ?대(?:학)? ?(?:소비자 ?)?(?:심리|신뢰) ?지수'], ['(?:ミシガン大学? ?)?消費者(?:信頼感|態度|心理)指数(?: \\(?ミシガン大学?\\)?)?|ミシガン大学? ?(?:消費者)?(?:信頼感|態度|心理)指数'], ['소비자심리지수', 'ミシガン大学消費者信頼感指数']),
    entry('Michigan Consumer Expectations', exact('Michigan Consumer Expectations', 'Michigan Consumer Expectations Prel', 'Michigan Consumer Expectations Final'), ['미시간 ?대(?:학)? ?소비자 ?기대 ?지수'], ['ミシガン大学? ?消費者期待指数'], ['소비자기대지수', 'ミシガン大学消費者期待指数']),
    entry('Michigan Inflation Expectations', exact('Michigan Inflation Expectations', 'Michigan Inflation Expectations Prel', 'Michigan Inflation Expectations Final'), ['미시간 ?대(?:학)? ?(?:1 ?년 ?)?(?:기대 ?인플레이션|인플레이션 ?기대)'], ['ミシガン大学? ?(?:1 ?年 ?)?(?:期待インフレ率|インフレ期待)'], ['기대인플레이션', 'ミシガン大学期待インフレ率']),
    entry('CB Consumer Confidence', exact('CB Consumer Confidence'), ['(?:CB|컨퍼런스 ?보드|콘퍼런스 ?보드) ?소비자 ?(?:신뢰|심리) ?지수'], ['(?:CB|コンファレンス ?ボード) ?消費者(?:信頼感|態度)指数'], ['소비자신뢰지수', '消費者信頼感指数']),
    entry('NY Empire State Manufacturing Index', exact('NY Empire State Manufacturing Index'), ['(?:뉴욕 ?(?:연은 )?)?엠파이어 ?스테이트 ?제조업 ?(?:경기 ?)?지수|뉴욕 ?연은 ?제조업 ?(?:경기 ?)?지수'], ['(?:NY|ニューヨーク) ?連銀 ?製造業 ?(?:景気|景況)指数|エンパイア ?ステート ?製造業 ?(?:景気|景況)指数'], ['엠파이어스테이트 제조업지수', 'NY連銀製造業景気指数']),
    entry('Philadelphia Fed Manufacturing Index', exact('Philadelphia Fed Manufacturing Index'), ['필라델피아 ?(?:연은|연준) ?(?:제조업 ?)?(?:경기 ?)?지수'], ['フィラデルフィア ?連銀 ?(?:製造業 ?)?(?:景気|景況)指数'], ['필라델피아 연은 지수', 'フィラデルフィア連銀景況指数']),
    entry('Richmond Fed Manufacturing Index', exact('Richmond Fed Manufacturing Index'), ['리치먼드 ?(?:연은|연준) ?(?:제조업 ?)?(?:경기 ?)?지수'], ['リッチモンド ?連銀 ?(?:製造業 ?)?(?:景気|景況)指数'], ['리치먼드 연은 지수', 'リッチモンド連銀製造業指数']),
    entry('Dallas Fed Manufacturing Index', exact('Dallas Fed Manufacturing Index'), ['댈러스 ?(?:연은|연준) ?(?:제조업 ?)?(?:경기 ?)?지수'], ['ダラス ?連銀 ?(?:製造業 ?)?(?:景気|景況)指数'], ['댈러스 연은 지수', 'ダラス連銀製造業指数']),
    entry('Kansas Fed Manufacturing Index', exact('Kansas Fed Manufacturing Index'), ['캔자스 ?(?:시티 ?)?(?:연은|연준) ?(?:제조업 ?)?(?:경기 ?)?지수'], ['カンザス ?(?:シティー? ?)?連銀 ?(?:製造業 ?)?(?:景気|景況)指数'], ['캔자스시티 연은 지수', 'カンザスシティ連銀製造業指数']),
    entry('Chicago Fed National Activity Index', exact('Chicago Fed National Activity Index'), ['시카고 ?(?:연은|연준) ?(?:전미 ?|국가 ?)?(?:경제 ?)?활동 ?지수'], ['シカゴ ?連銀 ?全米 ?活動指数'], ['시카고 연은 국가활동지수', 'シカゴ連銀全米活動指数']),
    entry('Leading Index MoM', exact('Leading Index MoM', 'CB Leading Index MoM'), periodic('MoM', '(?:컨퍼런스 ?보드 ?|콘퍼런스 ?보드 ?|CB ?)?경기 ?선행 ?지수|(?:컨퍼런스 ?보드 ?|CB ?)?선행 ?(?:경제 ?)?지수'), periodic('MoM', '(?:コンファレンス ?ボード ?|CB ?)?景気先行指数|(?:CB ?)?先行指数'), ['경기선행지수', '景気先行指数']),
    entry('NFIB Business Optimism Index', exact('NFIB Business Optimism Index'), ['NFIB ?(?:소기업 ?)?(?:낙관 ?지수|경기 ?낙관 ?지수)'], ['NFIB ?(?:中小企業 ?)?楽観(?:度)?指数'], ['NFIB 소기업 낙관지수', 'NFIB中小企業楽観指数']),
    // ── 주택 ──
    entry('NAHB Housing Market Index', exact('NAHB Housing Market Index'), ['NAHB ?(?:주택 ?시장 ?지수|주택 ?건설업(?:체)? ?(?:심리 ?)?지수)'], ['NAHB ?住宅市場指数'], ['NAHB 주택시장지수', 'NAHB住宅市場指数']),
    entry('Building Permits', exact('Building Permits'), ['(?:주택 ?)?(?:건축|건설) ?허가(?: ?(?:건수|실적))?'], ['(?:住宅 ?)?建築許可(?:件数)?'], ['건축허가', '建築許可件数']),
    entry('Building Permits MoM', exact('Building Permits MoM'), periodicStrict('MoM', '(?:주택 ?)?(?:건축|건설) ?허가(?: ?(?:건수|실적))?'), periodicStrict('MoM', '(?:住宅 ?)?建築許可(?:件数)?'), ['건축허가', '建築許可件数']),
    entry('Housing Starts', exact('Housing Starts'), ['주택 ?착공(?: ?(?:건수|실적))?'], ['住宅着工(?:件数)?'], ['주택착공', '住宅着工件数']),
    entry('Housing Starts MoM', exact('Housing Starts MoM'), periodicStrict('MoM', '주택 ?착공(?: ?(?:건수|실적))?'), periodicStrict('MoM', '住宅着工(?:件数)?'), ['주택착공', '住宅着工件数']),
    entry('Existing Home Sales', exact('Existing Home Sales'), ['기존 ?주택 ?(?:판매|매매)(?: ?(?:건수|실적))?'], ['中古住宅販売(?:件数)?'], ['기존주택판매', '中古住宅販売件数']),
    entry('Existing Home Sales MoM', exact('Existing Home Sales MoM'), periodicStrict('MoM', '기존 ?주택 ?(?:판매|매매)(?: ?(?:건수|실적))?'), periodicStrict('MoM', '中古住宅販売(?:件数)?'), ['기존주택판매', '中古住宅販売件数']),
    entry('New Home Sales', exact('New Home Sales'), ['신규 ?주택 ?(?:판매|매매)(?: ?(?:건수|실적))?'], ['新築住宅販売(?:件数)?'], ['신규주택판매', '新築住宅販売件数']),
    entry('New Home Sales MoM', exact('New Home Sales MoM'), periodicStrict('MoM', '신규 ?주택 ?(?:판매|매매)(?: ?(?:건수|실적))?'), periodicStrict('MoM', '新築住宅販売(?:件数)?'), ['신규주택판매', '新築住宅販売件数']),
    entry('Pending Home Sales MoM', exact('Pending Home Sales MoM'), periodic('MoM', '(?:잠정|미결) ?주택 ?(?:판매|매매)(?: ?(?:지수|건수))?'), periodic('MoM', '(?:中古 ?)?住宅販売(?:保留|仮契約|成約)(?:指数)?'), ['잠정주택판매', '中古住宅販売成約指数']),
    entry('Pending Home Sales YoY', exact('Pending Home Sales YoY'), periodic('YoY', '(?:잠정|미결) ?주택 ?(?:판매|매매)(?: ?(?:지수|건수))?'), periodic('YoY', '(?:中古 ?)?住宅販売(?:保留|仮契約|成約)(?:指数)?'), ['잠정주택판매', '中古住宅販売成約指数']),
    entry('S&P/Case-Shiller Home Price YoY', exact('S&P/Case-Shiller Home Price YoY'), periodic('YoY', '(?:S&P ?/ ?)?케이스 ?-? ?쉴러 ?(?:20 ?개 ?도시 ?)?(?:주택 ?가격 ?(?:지수)?|주택가격지수)'), periodic('YoY', '(?:S&P ?/ ?)?ケース ?・? ?シラー ?(?:20 ?都市 ?)?住宅価格(?:指数)?'), ['케이스실러 주택가격', 'ケースシラー住宅価格']),
    entry('MBA 30-Year Mortgage Rate', exact('MBA 30-Year Mortgage Rate'), ['MBA ?30 ?년 ?(?:만기 ?)?(?:고정 ?)?모기지 ?금리'], ['MBA ?30 ?年 ?(?:固定 ?)?住宅ローン金利'], ['MBA 30년 모기지 금리', 'MBA30年住宅ローン金利']),
    entry('MBA Mortgage Applications', exact('MBA Mortgage Applications'), ['MBA ?모기지 ?(?:신청|대출 ?신청)(?: ?(?:건수|지수))?'], ['MBA ?住宅ローン申請(?:件数|指数)?'], ['MBA 모기지 신청', 'MBA住宅ローン申請']),
    // ── 무역·재정·자금 ──
    entry('Balance of Trade', exact('Balance of Trade', 'Trade Balance'), ['(?:미 )?(?:상품 ?(?:및|·) ?서비스 ?)?무역 ?수지'], ['(?:米 )?貿易収支'], ['무역수지', '貿易収支']),
    entry('Goods Trade Balance', exact('Goods Trade Balance', 'Goods Trade Balance Adv'), ['상품 ?무역 ?수지'], ['(?:財|モノ)の? ?貿易収支'], ['상품 무역수지', '財貿易収支']),
    entry('Exports', exact('Exports'), ['(?:미 )?수출(?:액|실적)'], ['(?:米 )?輸出額'], ['수출액', '輸出額']),
    entry('Imports', exact('Imports'), ['(?:미 )?수입(?:액|실적)'], ['(?:米 )?輸入額'], ['수입액', '輸入額']),
    entry('Budget Balance', exact('Budget Balance', 'Monthly Budget Statement'), ['(?:미 )?(?:연방 )?(?:정부 )?(?:재정 ?수지|월간 ?재정 ?보고서|재정 ?적자)'], ['(?:米 )?(?:財政収支|月次財政収支)'], ['재정수지', '財政収支']),
    entry('Net Long-Term TIC Flows', exact('Net Long-Term TIC Flows'), ['(?:장기 ?)?(?:TIC ?)?(?:순 ?유입|자본 ?유출입|증권 ?순매입)(?: ?\\(?TIC\\)?)?|TIC ?장기 ?(?:순 ?유입|자본 ?흐름)'], ['(?:対米 ?)?長期 ?(?:TIC ?)?(?:ネット ?)?(?:資本)?(?:フロー|流入)|TIC ?長期(?:資本)?(?:収支|フロー)'], ['장기 TIC 순유입', '長期TICフロー']),
    // ── 연준·성장·정치 ──
    entry('FOMC Minutes', exact('FOMC Minutes'), ['(?:FOMC|연준) ?(?:회의 ?)?의사록'], ['(?:FOMC|連銀) ?(?:議事要旨|議事録)'], ['FOMC 의사록', '연준', 'FOMC議事要旨']),
    entry('Fed Interest Rate Decision', exact('Fed Interest Rate Decision'), ['(?:FOMC|연준) ?(?:의 )?(?:기준 ?)?금리 ?(?:결정|발표)|FOMC ?(?:정책 ?)?결정'], ['(?:FOMC|FRB) ?(?:の )?(?:政策)?金利 ?(?:決定|発表)|FOMC ?決定'], ['연준 금리 결정', 'FOMC金利決定']),
    entry('FOMC Press Conference', exact('FOMC Press Conference', 'Fed Press Conference'), ['(?:FOMC|연준|파월) ?(?:의장 ?)?(?:기자 ?회견)'], ['(?:FOMC|パウエル) ?(?:議長 ?)?(?:記者会見)'], ['연준 기자회견', 'FOMC記者会見']),
    // GDP: 차수 없는 표기는 어느 차수든(같은 발표 묶음), 차수를 쓰면 그 차수 줄만(관문 10310437 «속보치 예정» ↔ 확정치 줄 오통과)
    entry('GDP Growth Rate QoQ', core => /^GDP Growth Rate QoQ(?: (?:Adv|Advance|2nd Est|Second Estimate|Final|Third Estimate))?$/i.test(core), periodic('QoQ', GDP_KO), periodic('QoQ', GDP_JA), ['GDP 성장률', '国内総生産']),
    entry('GDP Growth Rate QoQ Adv', core => /^GDP Growth Rate QoQ (?:Adv|Advance)$/i.test(core), periodic('QoQ', `${GDP_KO} (?:\\(? ?)?(?:속보치?|예비치?|1 ?차 ?(?:추정치)?)`).map(a => `${a}(?: ?\\))?`), periodic('QoQ', `${GDP_JA} (?:\\(? ?)?(?:速報値?|1 ?次速報)`).map(a => `${a}(?: ?\\))?`), ['GDP 성장률', '国内総生産']),
    entry('GDP Growth Rate QoQ 2nd Est', core => /^GDP Growth Rate QoQ (?:2nd Est|Second Estimate)$/i.test(core), periodic('QoQ', `${GDP_KO} (?:\\(? ?)?(?:잠정치?|수정치?|2 ?차 ?(?:추정치)?)`).map(a => `${a}(?: ?\\))?`), periodic('QoQ', `${GDP_JA} (?:\\(? ?)?(?:改定値?|2 ?次速報)`).map(a => `${a}(?: ?\\))?`), ['GDP 성장률', '国内総生産']),
    entry('GDP Growth Rate QoQ Final', core => /^GDP Growth Rate QoQ (?:Final|Third Estimate)$/i.test(core), periodic('QoQ', `${GDP_KO} (?:\\(? ?)?(?:확정치?|3 ?차 ?(?:추정치)?)`).map(a => `${a}(?: ?\\))?`), periodic('QoQ', `${GDP_JA} (?:\\(? ?)?(?:確報値?|確定値?|3 ?次速報)`).map(a => `${a}(?: ?\\))?`), ['GDP 성장률', '国内総生産']),
    entry('GDP Price Index QoQ', core => /^GDP Price Index QoQ/i.test(core), periodic('QoQ', '(?:GDP|국내 ?총생산) ?(?:물가|가격) ?(?:지수|디플레이터)'), periodic('QoQ', '(?:GDP|国内総生産) ?(?:物価|価格)(?:指数|デフレーター)'), ['GDP 물가지수', 'GDP価格指数']),
    entry('Midterm Elections', exact('Midterm Elections'), ['(?:미 )?중간 ?선거'], ['(?:米 )?中間選挙'], ['중간선거', '中間選挙']),
    entry('Total Vehicle Sales', exact('Total Vehicle Sales'), ['(?:총 )?(?:자동차|차량) ?판매(?: ?(?:대수|량|실적))?'], ['(?:総 ?)?(?:自動車|新車)販売(?:台数)?'], ['자동차 판매', '自動車販売台数']),
    ...fedPeople, fedUnknownPerson,
    ...auctions, auctionUnknownTerm,
];

/** 근거 줄 이름(본 이름)에 해당하는 사전 항목들 */
function entriesFor(core: string): Entry[] { return ENTRIES.filter(e => e.test(core)); }

/** 사건군 대조(EVENT_FAMILIES)에 쓸 «이 근거 줄의 한·일 표기» — «2-Year Note Auction» 줄이 «국채 입찰»을 뒷받침하게 */
export function eventNameGloss(name: string | null | undefined): string {
    if (!name) return '';
    return [...new Set(entriesFor(eventCoreName(name)).flatMap(e => e.gloss))].join(' · ');
}

/** 근거 글(줄 모음·프롬프트 데이터)에 들어 있는 경제 일정 이름마다 한·일 표기를 덧붙인다(사건군 대조 전용). 없으면 원문 그대로. */
export function withEventNameGloss(evidence: string): string {
    const glosses = new Set<string>();
    for (const m of String(evidence || '').matchAll(/\[economic calendar;[^\]]*\]\s*(.+?)\s*\([^()"]*\)\s*(?=["\n]|$)/g)) {
        const g = eventNameGloss(m[1]);
        if (g) glosses.add(g);
    }
    return glosses.size ? `${evidence}\n${[...glosses].join('\n')}` : evidence;
}

// ─── 표기 앞 수식어 판정 ───
/** 표기 바로 앞(띄어 쓴 한 낱말까지)에 와도 «다른 지표»가 되지 않는 말 */
const LEAD_OK = new Set(['et', 'kst', 'jst', 'cftc', 'eia', 'api', 'ism', 'mba', 'nahb', 'adp', '미국', '미국의', '미', '米', '米国', '米国の', '예정', '예정된', '예정인', '예정의', '다음', '다음은', '다음의', '次', '次の', '次は', '次回', '次回の', '予定', '予定の', '発表予定の', '公表予定の']);
/**
 * 한국어 앞 낱말 허용 모양(목록 밖은 «다른 지표를 꾸미는 명사»로 보고 실패 — 관문 10310437 «노인 실업률»: 끝 글자만 보면 «인»이 어미처럼 보인다).
 *   ① 일정·자리 명사 + 조사(«예정된»·«분기점은»·«시험대는»·«변수인») ② 분명한 동사 활용(«발표되는»·«나올»·«앞둔»·«지켜볼») ③ 조사로 끝나는 시각 표기(«ET에»).
 *   «의»로 끝나는 꾸밈(«청년층의»)은 허용 목록 낱말일 때만.
 */
const KO_LEAD_WORD = /^(?:예정|발표|공개|공표|확인|주목|관심|초점|변수|재료|분기점|시험대|관문|고비|이벤트|일정|다음|이번|지표|결과|시각)(?:은|는|이|가|인|된|될|으로|로|도|에)?$|(?:되는|된|될|하는|할|있는|있을|앞둔|앞두고|나오는|나올|지켜볼|봐야 할|볼|잡힌|예정된|예정인)$/;
const HANGUL = /[가-힣]/;
const KANA_KANJI = /[ぁ-んァ-ヴー一-龯々]/;
const HIRAGANA_NOT_NO = /[ぁ-ゔ]$/;

/** 괄호 속이 이름을 바꾸지 않는 말인가 — 영숫자(영어 이름·기간)·요일·현지 시각·기간(10월분·Q3) */
const BENIGN_PAREN = /^\s*(?:[\d ,.:/-]*|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?(?:\s*\/\s*\d{1,2})?|Q[1-4]|[월화수목금토일]|[月火水木金土日]|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?|(?:한국|日本時間)\s*(?:\d{1,2}\/\d{1,2}\s*)?\d{1,2}:\d{2}|\d{1,2}\s*월(?:분)?|\d{1,2}\s*月(?:分)?|[1-4]\s*분기|第?[1-4]四半期)\s*$/i;
/** 괄호 속 영어가 그 일정 영어 이름(의 낱말들)일 뿐인가 — «(Unemployment Rate)»·«(speculative net positions)» 허용, «(U-6)»·«(Youth)» 는 다른 지표(관문 10310504 ①) */
function englishOfEntries(content: string, entries: Entry[]): boolean {
    const words = content.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (!words.length || !/^[A-Za-z0-9 ,.&/'+-]+$/.test(content.trim())) return false;
    return entries.some(e => { const own = e.id.toLowerCase().split(/\s+/); return words.every(w => own.includes(w)); });
}
/** 괄호 속이 이름을 바꾸지 않는 말인가(기간·요일·현지 시각·일반 낱말 풀이·그 일정의 영어 이름) */
function parenOk(content: string, entries: Entry[]): boolean {
    return BENIGN_PAREN.test(content) || genericOnly(content) || englishOfEntries(content, entries);
}
function leadReason(before: string): string | null {
    if (!before) return null;
    // 바로 앞 괄호 묶음은 호출자가 그 일정 기준으로 본다(«(청년) 실업률»·«(U-6) 실업률»)
    if (/[)）]\s*$/.test(before)) return null;
    const spaced = /\s$/.test(before);
    const token = (before.match(/([^\s()（）「」『』\[\]{}.,!?;:、。・·"'“”‘’]+)\s*$/) || [])[1] || '';
    if (!token) return null;   // 앞이 문장 부호·괄호·시작
    // 날짜·시각·숫자 표기(10/30·15:30)는 이름의 일부가 아니다
    if (/^[\d/:.\-]+$/.test(token)) return null;
    if (LEAD_OK.has(token.toLowerCase())) return null;
    if (/^(?:ET|KST|JST|\d{1,2}:\d{2})(?:에|に|の|에는|には)?$/i.test(token)) return null;   // «15:30 ET에 …»·«ETに»
    const last = token.slice(-1);
    if (HANGUL.test(last)) {
        if (!spaced) return `lead-attached:${token}`;           // «청년실업률»
        return KO_LEAD_WORD.test(token) ? null : `lead-noun:${token}`;   // «청년 실업률»·«노인 실업률»·«근원 물가»
    }
    if (KANA_KANJI.test(last)) {
        if (HIRAGANA_NOT_NO.test(token) && last !== 'の') return null;       // «予定されている»·«には»
        if (last === 'の') {
            const head = token.slice(0, -1);
            const owner = head.match(/([ァ-ヴー一-龯々]+)$/)?.[1] || head.match(/([A-Za-z0-9&]+)$/)?.[1] || '';
            return !owner || LEAD_OK.has(owner.toLowerCase()) || LEAD_OK.has(`${owner}の`) ? null : `lead-no:${owner}`;   // «若年層の失業率»
        }
        const run = token.match(/([ァ-ヴー一-龯々]+)$/)?.[1] || '';
        // 일본어는 띄어 쓰지 않는다 — 한자·가타카나가 바로 붙으면 앞부분 끝이 허용어일 때만(«…予定»)
        return [...LEAD_OK].some(w => w && run.endsWith(w) && KANA_KANJI.test(w)) ? null : `lead-kanji:${run || token}`;
    }
    // 라틴 낱말(«U-6»·«Core»·«Youth»)은 허용 목록 밖이면 다른 지표의 일부로 본다
    return `lead-latin:${token}`;
}

/**
 * 글 속 «예정 일정 이름»의 한·일 표기(사전) 위치. 가장 긴 표기를 우선하고, 같은 범위를 여러 항목이 설명하면 후보를 합친다.
 * ok=false 는 앞뒤 수식어 때문에 대조하지 않는 표기 — 호출자는 그 언급을 «맞는 예정 줄 없음»으로 처리한다(fail-closed).
 */
export function scheduledEventNameHits(text: string): EventNameHit[] {
    if (!text || !(HANGUL.test(text) || KANA_KANJI.test(text))) return [];
    const raw: Array<{ start: number; end: number; entry: Entry }> = [];
    for (const entry of ENTRIES) {
        for (const re of entry.aliases) {
            re.lastIndex = 0;
            for (const m of text.matchAll(re)) {
                const s = m[0];
                // 공백·조사만 남은 빈 매칭, 한·일 글자가 하나도 없는 매칭(영어 원문 «CPI»)은 사전 표기가 아니다 — 영어 이름은 기존 대조가 맡는다
                if (!s.trim() || !(HANGUL.test(s) || KANA_KANJI.test(s))) continue;
                const lead = s.match(/^\s*/)![0].length, trail = s.match(/\s*$/)![0].length;
                raw.push({ start: m.index! + lead, end: m.index! + s.length - trail, entry });
            }
        }
    }
    // 더 긴 표기에 완전히 포함되는 짧은 표기는 버린다(«근원 물가상승률» 안의 «물가상승률»)
    const kept = raw.filter(a => !raw.some(b => b !== a && b.start <= a.start && b.end >= a.end && (b.end - b.start) > (a.end - a.start)));
    const groups = new Map<string, { start: number; end: number; entries: Set<Entry> }>();
    for (const k of kept) {
        const key = `${k.start}:${k.end}`;
        const g = groups.get(key) || { start: k.start, end: k.end, entries: new Set<Entry>() };
        g.entries.add(k.entry);
        groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.start - b.start).map(g => {
        // 변화·비율 지표(MoM·YoY·QoQ·…Change·…Rate)는 «지수·건수·재고량» 같은 수준 낱말을 기간 수식어 없이 쓴 표기로 인정하지 않는다(관문 10310624 «고용 비용 지수»·«원유 재고량»)
        const span = text.slice(g.start, g.end);
        // 표기 바로 뒤 낱말까지(«고용 비용» + «지수») — 정규식 갈래가 짧은 쪽에서 멈춰도 수준 낱말을 놓치지 않게
        const nextWord = text.slice(g.end).match(/^\s*([가-힣ぁ-んァ-ヴー一-龯]+)/)?.[1] || '';
        const levelOnly = LEVEL_WORD.test(span + nextWord) && !PERIOD_ANY.test(span + text.slice(g.end, g.end + 12));
        const entries = [...g.entries].filter(e => !(levelOnly && CHANGE_LIKE.test(e.id)));
        if (!entries.length) return { start: g.start, end: g.end, text: span, ok: false, why: 'level-vs-change', test: () => false };
        const before = text.slice(0, g.start);
        const parenBefore = before.match(/[(（]([^()（）]*)[)）]\s*$/);
        const lead = parenBefore ? (parenOk(parenBefore[1], entries) ? null : `lead-paren:${parenBefore[1]}`) : leadReason(before);
        const after = text.slice(g.end);
        const parenAfter = after.match(/^\s*[(（]([^()（）]*)[)）]/);
        const trailing = TRAILING_QUALIFIER.test(after) ? `trail:${after.slice(0, 8).trim()}`
            : parenAfter && !parenOk(parenAfter[1], entries) ? `trail-paren:${parenAfter[1]}`   // «실업률(청년)» — 관문 10310457 ② · «포지션(선물 투기 순포지션)» 같은 일반 낱말 풀이는 허용
                : tailReason(parenAfter ? after.slice(parenAfter[0].length) : after);
        const why = lead || trailing || undefined;
        return { start: g.start, end: g.end, text: text.slice(g.start, g.end), ok: !why, ...(why ? { why } : {}), test: (core: string) => entries.some(e => e.test(core)) };
    });
}

/**
 * 영어 일정 이름이 «중간에 짧은 번역 꼬리표 + 괄호»로 갈라져 쓰였나 — «CFTC S&P 500 미결제약정(speculative net positions)»(실모델 10/31 ko 12회 중 8회).
 *   이름의 영어 낱말이 «모두·순서대로» 있고, 갈라진 곳은 한 군데(영숫자 없는 20자 이하 + «(»)뿐일 때만. 꼬리표의 번역 품질은 기존 계약(«이름(번역)» 허용)과 같이 보지 않는다.
 */
export function splitEnglishNameMention(text: string, name: string): boolean {
    const tokens = eventCoreName(name).split(/\s+/).filter(Boolean);
    if (tokens.length < 3 || !/[(（]/.test(text)) return false;
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (let k = 1; k < tokens.length; k++) {
        const left = tokens.slice(0, k).map(esc).join('\\s*'), right = tokens.slice(k).map(esc).join('\\s*');
        const m = new RegExp(`(?<![A-Za-z0-9])${left}\\s*([^A-Za-z0-9()（）]{0,20}?)\\s*[(（]\\s*${right}(?![A-Za-z0-9])`, 'i').exec(text);
        // 갈라진 이름 뒤도 같은 허용 목록(«…(Gold speculative net positions)의 매수» 실패)
        if (m && splitGapOk(m[1], tokens.join(' ').toLowerCase()) && !tailReason(text.slice(m.index + m[0].length).replace(/^\s*[)）]/, ''))) return true;
    }
    return false;
}
/**
 * 갈라진 곳의 꼬리표가 «그 이름의 번역»일 수만 있게(관문 10310457 ① «CFTC 금 미결제약정(Crude Oil …)» = 금 일정으로 읽힘):
 *   포지션·미결제약정·선물·보고 같은 일반 낱말과, 이름에 실제로 있는 자산(원유=Crude Oil·금=Gold·나스닥=Nasdaq)만 허용. 그 밖의 말이 남으면 실패.
 */
// 미결제약정(建玉)·매수/매도(롱·숏)는 순포지션과 다른 값이라 꼬리표로 인정하지 않는다(관문 10310631)
const GAP_GENERIC = /선물|투기(?:적|\s*세력)?|순|포지션|보고서?|공시|자료|데이터|주간|의|先物|投機筋?|投機的|ネット|純|ポジション|報告|公示|資料|データ|週間|の/g;
const GAP_ASSETS: Array<[RegExp, string]> = [[/원유|原油/g, 'crude oil'], [/금|金/g, 'gold'], [/나스닥|ナスダック/g, 'nasdaq'], [/천연\s*가스|天然ガス/g, 'natural gas']];
/** 포지션·선물·투기·보고 같은 일반 낱말만으로 된 풀이인가(자산·지표 이름 없음) */
function genericOnly(text: string): boolean {
    return !/[^\s·・,、-]/.test(text.replace(GAP_GENERIC, ' '));
}
function splitGapOk(gap: string, nameLower: string): boolean {
    let rest = gap;
    for (const [re, en] of GAP_ASSETS) { if (re.test(rest)) { if (!nameLower.includes(en)) return false; rest = rest.replace(re, ' '); } re.lastIndex = 0; }
    rest = rest.replace(GAP_GENERIC, ' ');
    return !/[^\s·・,、-]/.test(rest);
}

/** 시험·관문용 — 사전이 이 일정 이름을 아는가(한·일 표기 둘 다 있는가) */
export function knowsEventName(name: string): { ko: boolean; ja: boolean } {
    const es = entriesFor(eventCoreName(name));
    return { ko: es.some(e => e.aliases.some(a => HANGUL.test(a.source))), ja: es.some(e => e.aliases.some(a => KANA_KANJI.test(a.source))) };
}
