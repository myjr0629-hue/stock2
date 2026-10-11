// ============================================================================
// 실적 주간 페이지(/[locale]/earnings-week)의 «순수 규칙» — 주(週) 경계·발표 상태·한국 시각 환산·요약·언어별 문구 (2026-10-11)
//
// 왜: 커뮤니티는 «앱 홍보 글»은 지우지만 «유용한 정보 글»은 퍼뜨린다. 실적 시즌 첫 주(10/12~10/16)에
//   «이번 주 실적 발표 종목 + 옵션이 반영한 예상 변동폭 + Max Pain» 한 장을 무료로 내놓고, 그 안에서 앱 설치로 잇는다.
//
// 원칙(대표): «자료는 항상 신선하고 정확해야» — 이 파일은 네트워크·캐시 없이 입력만으로 답한다(시험: tests/earningsWeek.test.ts).
//   · 일정은 «회사가 공지한 것»(lib/earningsConfirmed.ts CONFIRMED_EARNINGS)만. 추정 날짜는 표에 넣지 않는다.
//   · 날짜·상태는 미국 동부(ET) 달력으로 센다. 한국 시각은 ET 공지 시각을 환산한다(서머타임 반영) —
//     공지에 시각이 없으면 «장전 = 한국 같은 날 저녁~밤 / 장후 = 다음 날 새벽»으로만 말한다(분 단위를 지어내지 않는다).
//   · 숫자(예상 변동·레벨)는 여기서 만들지 않는다 — services/earningsWeekService 가 기존 «한 문»(impliedMove.ts·structureService)에서 읽어 온다.
// ============================================================================

import { daysBetweenYmd, etDateOf, etMinutesOf } from './marketCalendar';
import type { ConfirmedEarnings } from './earningsConfirmed';

export type Loc = 'ko' | 'en' | 'ja';
export const EW_LOCALES: readonly Loc[] = ['ko', 'ja', 'en'];
export const toLoc = (l: string | null | undefined): Loc => (l === 'ko' || l === 'ja' ? l : 'en');

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' + n일 (달력 계산 — 시간대 무관) */
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** 요일 0=일 … 6=토 (달력 날짜 기준) */
export function weekdayOfYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export interface WeekRange {
  /** 월요일 */
  start: string;
  /** 금요일 */
  end: string;
  /** 지금의 ET 날짜 */
  today: string;
  /** 주말이라 «다음 주»로 넘겼다 */
  rolled: boolean;
}

/** 뉴욕 기준 월~금. 토·일에는 다음 주(월~금)를 가리킨다 — 일요일 밤에 «이번 주»가 지난주로 읽히지 않게. */
export function weekRangeET(nowMs: number = Date.now()): WeekRange {
  const today = etDateOf(nowMs);
  const wd = weekdayOfYmd(today);
  const rolled = wd === 0 || wd === 6;
  const start = wd === 0 ? addDaysYmd(today, 1) : wd === 6 ? addDaysYmd(today, 2) : addDaysYmd(today, -(wd - 1));
  return { start, end: addDaysYmd(start, 4), today, rolled };
}

/** 회사 공지 목록에서 그 주(월~금)의 항목 — 날짜 → 장전 → 시각 미공지 → 장후 → 티커순(공지된 분 단위 시각은 일부 종목에만 있어 순서에 쓰지 않는다 — 있는 것끼리만 앞세우면 없는 것이 «더 늦다»고 읽힌다). 지난 날짜도 넣는다(상태가 «발표 완료»로 바뀐다). */
export function selectWeekEntries(list: readonly ConfirmedEarnings[], start: string, end: string): ConfirmedEarnings[] {
  const rank = (h: string) => (h === 'bmo' ? 0 : h === 'amc' ? 2 : 1);
  return list
    .filter((c) => YMD.test(c.date) && c.date >= start && c.date <= end)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || rank(a.hour) - rank(b.hour) || a.ticker.localeCompare(b.ticker));
}

export type Phase = 'done' | 'today' | 'upcoming';

/** 정규장 시작·마감 후 «발표 완료»로 보는 시각(ET 분) — bmo 는 개장(09:30)이면 이미 나왔고, amc 는 18:00 이면 대부분 나왔다(공지가 장 마감 직후 ~ 17:30). */
export const BMO_DONE_MIN = 9 * 60 + 30;
export const AMC_DONE_MIN = 18 * 60;

/** 발표 상태 — done 발표 완료 · today 오늘(아직) · upcoming 앞으로. 시각 미공지('')는 그날 끝(다음 ET 날짜)까지 today. */
export function phaseOf(date: string, hour: string, nowMs: number = Date.now()): Phase {
  const today = etDateOf(nowMs);
  if (date < today) return 'done';
  if (date > today) return 'upcoming';
  const min = etMinutesOf(nowMs);
  if (hour === 'bmo') return min >= BMO_DONE_MIN ? 'done' : 'today';
  if (hour === 'amc') return min >= AMC_DONE_MIN ? 'done' : 'today';
  return 'today';
}

// ── 한국 시각 ────────────────────────────────────────────────────────────────

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
function etWall(ms: number): string {
  const p = ET_FMT.formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

/** ET 벽시계('YYYY-MM-DD', 'HH:MM') → UTC ms (서머타임 자동). 존재하지 않는 시각이면 null. */
export function etWallToMs(ymd: string, hhmm: string): number | null {
  if (!YMD.test(ymd) || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  for (const off of [4, 5]) {
    const ms = Date.UTC(y, mo - 1, d, h + off, mi);
    if (etWall(ms) === `${ymd} ${hhmm}`) return ms;
  }
  return null;
}

/** UTC ms → 한국(KST, UTC+9 — 일본 JST 와 같다) 날짜·시각·요일 */
export function kstOf(ms: number): { date: string; time: string; weekday: number } {
  const k = new Date(ms + 9 * 3600_000);
  const date = k.toISOString().slice(0, 10);
  return { date, time: k.toISOString().slice(11, 16), weekday: k.getUTCDay() };
}

export interface ReleaseWhen {
  /** ET 발표일 */
  etDate: string;
  /** 'HH:MM'(ET) — 공지에 시각이 있을 때만 */
  etTime: string | null;
  hour: 'amc' | 'bmo' | '';
  /** 한국 날짜 — 시각 미공지 장전 = 같은 날, 장후 = 다음 날, 시각 미공지('') = null */
  kstDate: string | null;
  /** 'HH:MM'(KST) — etTime 이 있을 때만 */
  kstTime: string | null;
  /** 한국 시각의 대략적 구간 — 정확한 분을 모를 때 */
  kstApprox: 'evening' | 'dawn' | null;
}

export function releaseWhen(c: Pick<ConfirmedEarnings, 'date' | 'hour' | 'etTime'>): ReleaseWhen {
  const base: ReleaseWhen = { etDate: c.date, etTime: null, hour: c.hour, kstDate: null, kstTime: null, kstApprox: null };
  if (c.etTime) {
    const ms = etWallToMs(c.date, c.etTime);
    if (ms != null) {
      const k = kstOf(ms);
      return { ...base, etTime: c.etTime, kstDate: k.date, kstTime: k.time };
    }
  }
  if (c.hour === 'bmo') return { ...base, kstDate: c.date, kstApprox: 'evening' };
  if (c.hour === 'amc') return { ...base, kstDate: addDaysYmd(c.date, 1), kstApprox: 'dawn' };
  return base;
}

// ── 날짜 표기 ────────────────────────────────────────────────────────────────

const WD: Record<Loc, string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
/** '10/13(화)' · '10/13 (Tue)' */
export function mdw(ymd: string, loc: Loc): string {
  const md = `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
  const w = WD[loc][weekdayOfYmd(ymd)];
  return loc === 'en' ? `${md} (${w})` : `${md}(${w})`;
}

// ── 요약 ─────────────────────────────────────────────────────────────────────

export interface SummaryRow {
  ticker: string;
  date: string;
  hour: string;
  phase: Phase;
  impliedMovePct: number | null;
}

/** 아직 발표 전인 종목 중 가장 큰 예상 변동 — 없으면 null. 같으면 발표가 이른 쪽. */
export function biggestMove(rows: readonly SummaryRow[]): SummaryRow | null {
  let best: SummaryRow | null = null;
  for (const r of rows) {
    if (r.phase === 'done' || !(Number(r.impliedMovePct) > 0)) continue;
    if (!best || r.impliedMovePct! > best.impliedMovePct! || (r.impliedMovePct === best.impliedMovePct && r.date < best.date)) best = r;
  }
  return best;
}

export const pctText = (n: number | null | undefined): string => (Number(n) > 0 ? `±${Number(n).toFixed(1)}%` : '—');

// ── 앱 연결 링크 ─────────────────────────────────────────────────────────────

/** 언어별 코드 — 한국어 NAVERPRO · 일본어 NOTEJP · 영어 IHPRO (대표 지시 10/11). 링크의 from 태그는 coupon.ts BY_TAG 가 «SIGNUM 웹»으로 읽는다. */
export const APP_CODE: Record<Loc, 'NAVERPRO' | 'NOTEJP' | 'IHPRO'> = { ko: 'NAVERPRO', ja: 'NOTEJP', en: 'IHPRO' };
export const APP_FROM_TAG = 'earnings_week';
export const appLink = (loc: Loc, base = 'https://www.signumhq.com'): string => `${base}/app?from=${APP_FROM_TAG}&code=${APP_CODE[loc]}`;

// ── 문구 ─────────────────────────────────────────────────────────────────────

export interface Copy {
  kicker: string;
  h1: (range: string) => string;
  lead: string;
  metaTitle: (range: string) => string;
  metaDesc: (d: { n: number; top: string | null; range: string }) => string;
  topLine: (d: { ticker: string; pct: string; when: string }) => string;
  topNone: string;
  countLine: (d: { n: number; done: number; left: number }) => string;
  rolled: string;
  asOfClose: (d: { day: string }) => string;
  asOfLive: string;
  asOfAt: (d: { ny: string; kst: string }) => string;
  asOfUnknown: string;
  col: { stock: string; when: string; move: string; price: string; maxPain: string; callWall: string; putFloor: string };
  hourBmo: string; hourAmc: string; hourNone: string;
  kstEvening: string; kstDawn: string; kstLabel: string; etLabel: string;
  done: string; today: string;
  expiryTag: (md: string) => string;
  sessionTag: (md: string) => string;
  noData: string;
  empty: string;
  pendingT: string; pendingNote: string;
  readT: string; read: Array<[string, string]>;
  cta: string; ctaSub: string; ctaNote: string;
  share: string; shareCopied: string;
  shareTitle: (range: string) => string;
  shareText: (d: { n: number; top: string | null }) => string;
  moreT: string; moreDp: string; moreOf: string; moreAll: string;
  disc: string;
  verified: (d: { at: string }) => string;
}

const KO: Copy = {
  kicker: 'SIGNUM HQ · 실적 주간',
  h1: (r) => `이번 주 미국 실적 발표 ${r} — 옵션이 반영한 예상 변동폭`,
  lead: '회사가 직접 공지한 실적 발표 일정만 모았습니다. 종목마다 옵션 시장이 반영한 예상 변동폭(ATM 스트래들)과 Max Pain · Call Wall · Put Floor를 한 장으로. 무료, 가입 없이.',
  metaTitle: (r) => `이번 주 미국 실적 발표 ${r} · 옵션 예상 변동폭 · Max Pain | SIGNUM HQ`,
  metaDesc: ({ n, top, range }) => `${range} 미국 실적 발표 ${n}종목(회사 공지 기준)의 발표일·시간, 옵션이 반영한 예상 변동폭, Max Pain·Call Wall·Put Floor.${top ? ` ${top}.` : ''} 무료.`,
  topLine: ({ ticker, pct, when }) => `이번 주 가장 큰 예상 변동: ${ticker} ${pct} (${when})`,
  topNone: '예상 변동 자료를 불러오는 중입니다.',
  countLine: ({ n, done, left }) => `회사가 공지한 ${n}종목 · 발표 완료 ${done} · 남음 ${left}`,
  rolled: '주말이라 다음 주 일정을 보여 드립니다.',
  asOfClose: ({ day }) => `옵션 숫자 기준: 뉴욕 ${day} 마감 호가`,
  asOfLive: '옵션 숫자 기준: 장중 실시간 호가',
  asOfAt: ({ ny, kst }) => `계산 시각 뉴욕 ${ny} · 한국 ${kst}`,
  asOfUnknown: '옵션 숫자 기준 시각을 확인하는 중입니다.',
  col: { stock: '종목', when: '발표(뉴욕 · 한국)', move: '예상 변동폭', price: '기준가', maxPain: 'Max Pain', callWall: 'Call Wall', putFloor: 'Put Floor' },
  hourBmo: '장전', hourAmc: '장후', hourNone: '시각 미공지',
  kstEvening: '저녁~밤', kstDawn: '새벽', kstLabel: '한국', etLabel: '뉴욕',
  done: '발표 완료', today: '오늘 발표',
  expiryTag: (md) => `${md} 만기`,
  sessionTag: (md) => `${md} 세션`,
  noData: '자료 갱신 중',
  empty: '이 주에 회사가 공지한 실적 발표 종목이 아직 없습니다. 공지가 확인되는 대로 채워집니다.',
  pendingT: '날짜 확인 전',
  pendingNote: '아직 회사 공지로 확인되지 않아 표에서 뺐습니다(데이터 제공처의 예정일):',
  readT: '이 숫자 읽는 법',
  read: [
    ['예상 변동폭', '옵션 시장이 가격에 반영한 움직임의 크기입니다. 현물에 가장 가까운 행사가의 콜·풋 중간가를 더한 ATM 스트래들 ÷ 기준가로 계산하고, 만기는 발표 직후 첫 만기입니다. 발표 당일 움직임뿐 아니라 그 만기까지의 일반적인 변동도 함께 들어 있어, 실제 발표 반응의 예측이 아닙니다.'],
    ['Max Pain · Call Wall · Put Floor', '같은 만기의 미결제약정으로 계산한 값입니다. Max Pain은 옵션 매수자의 만기 가치가 가장 작아지는 행사가, Call Wall·Put Floor는 현물 위·아래에서 콜·풋 미결제약정이 가장 두꺼운 행사가입니다. 단기 가격대의 참고일 뿐 방향을 알려 주지 않습니다.'],
    ['기준가와 기준 시각', '기준가는 위 계산에 쓴 현물가(가장 최근 체결가)입니다. 장중에는 실시간 호가, 장이 닫혀 있으면 마지막 세션 마감 호가를 씁니다. 표 위의 기준 시각을 함께 보세요.'],
    ['발표 시각', '회사 공지에 시각이 있으면 뉴욕 시각과 한국 시각을 함께 적고, 없으면 장전(한국 같은 날 저녁~밤)·장후(한국 다음 날 새벽)로만 적습니다.'],
  ],
  cta: '실시간 옵션 흐름·Max Pain 변화는 앱에서 — PRO 1개월 무료(이후 자동 갱신·언제든 해지)',
  ctaSub: 'iOS · Android',
  ctaNote: '코드가 자동으로 채워집니다.',
  share: '이 표 공유하기', shareCopied: '링크를 복사했어요',
  shareTitle: (r) => `이번 주 미국 실적 발표 ${r}`,
  shareText: ({ n, top }) => `이번 주 미국 실적 ${n}종목(회사 공시 기준) · 옵션이 반영한 예상 변동폭 + Max Pain 한 장${top ? ` — ${top}` : ''}`,
  moreT: '함께 보기', moreDp: '오늘의 다크풀 상위 종목', moreOf: '오늘의 옵션 특이거래', moreAll: '전체 티커',
  disc: '정보 제공·교육 목적입니다. 투자 자문이나 매수·매도 권유가 아니며, 정확성이나 결과를 보장하지 않습니다.',
  verified: ({ at }) => `발표 일정은 회사 공지 원문으로 확인했습니다(최종 확인 ${at}).`,
};

const JA: Copy = {
  kicker: 'SIGNUM HQ · 決算ウィーク',
  h1: (r) => `今週の米国決算 ${r} — オプションが織り込む予想変動幅`,
  lead: '企業が自ら告知した決算発表の日程だけを集めました。銘柄ごとに、オプション市場が織り込む予想変動幅(ATMストラドル)とMax Pain・Call Wall・Put Floorを1枚に。無料、登録不要。',
  metaTitle: (r) => `今週の米国決算 ${r} · オプション予想変動幅 · Max Pain | SIGNUM HQ`,
  metaDesc: ({ n, top, range }) => `${range}の米国決算${n}銘柄(企業の告知ベース)の発表日・時間、オプションが織り込む予想変動幅、Max Pain・Call Wall・Put Floor。${top ? `${top}。` : ''}無料。`,
  topLine: ({ ticker, pct, when }) => `今週最大の予想変動: ${ticker} ${pct}(${when})`,
  topNone: '予想変動のデータを読み込み中です。',
  countLine: ({ n, done, left }) => `企業が告知した${n}銘柄 · 発表済み${done} · 残り${left}`,
  rolled: '週末のため、来週の日程を表示しています。',
  asOfClose: ({ day }) => `オプション数値の基準: ニューヨーク ${day} 引け時点の気配`,
  asOfLive: 'オプション数値の基準: 場中のリアルタイム気配',
  asOfAt: ({ ny, kst }) => `計算時刻 NY ${ny} · 日本 ${kst}`,
  asOfUnknown: 'オプション数値の基準時刻を確認中です。',
  col: { stock: '銘柄', when: '発表(NY · 日本)', move: '予想変動幅', price: '基準価格', maxPain: 'Max Pain', callWall: 'Call Wall', putFloor: 'Put Floor' },
  hourBmo: '寄り前', hourAmc: '引け後', hourNone: '時刻未告知',
  kstEvening: '夜', kstDawn: '早朝', kstLabel: '日本', etLabel: 'NY',
  done: '発表済み', today: '本日発表',
  expiryTag: (md) => `${md}満期`,
  sessionTag: (md) => `${md}セッション`,
  noData: 'データ更新中',
  empty: 'この週に企業が告知した決算銘柄はまだありません。告知が確認でき次第、追加されます。',
  pendingT: '日程の確認前',
  pendingNote: 'まだ企業の告知で確認できていないため表から外しました(データ提供元の予定日):',
  readT: '数値の読み方',
  read: [
    ['予想変動幅', 'オプション市場が価格に織り込んでいる値動きの大きさです。現値に最も近い権利行使価格のコールとプットの仲値を足したATMストラドル ÷ 基準価格で計算し、満期は発表直後の最初の満期です。発表当日だけでなくその満期までの通常の変動も含むため、実際の発表反応の予測ではありません。'],
    ['Max Pain · Call Wall · Put Floor', '同じ満期の建玉から計算した値です。Max Painはオプション買い手の満期価値が最小になる権利行使価格、Call Wall・Put Floorは現値の上・下でコール・プットの建玉が最も厚い権利行使価格です。短期の価格帯の目安であり、方向を示すものではありません。'],
    ['基準価格と基準時刻', '基準価格は上記の計算に使った現値(直近の約定価格)です。場中はリアルタイムの気配、市場が閉じている間は直近セッション終了時の気配を使います。表の上の基準時刻と合わせてご覧ください。'],
    ['発表時刻', '企業の告知に時刻があればニューヨーク時間と日本時間を併記し、なければ寄り前(日本 同日の夜)・引け後(日本 翌日の早朝)とだけ示します。'],
  ],
  cta: 'リアルタイムのオプションフロー・Max Painの変化はアプリで — PRO 1か月無料(その後は自動更新・いつでも解約可)',
  ctaSub: 'iOS · Android',
  ctaNote: 'コードは自動で入力されます。',
  share: 'この表を共有', shareCopied: 'リンクをコピーしました',
  shareTitle: (r) => `今週の米国決算 ${r}`,
  shareText: ({ n, top }) => `今週の米国決算${n}銘柄(企業の告知ベース) · オプションが織り込む予想変動幅 + Max Pain を1枚に${top ? ` — ${top}` : ''}`,
  moreT: 'あわせて見る', moreDp: '本日のダークプール上位銘柄', moreOf: '本日のオプション特異取引', moreAll: '全ティッカー',
  disc: '情報提供・教育目的です。投資助言や売買の推奨ではなく、正確性や結果を保証するものではありません。',
  verified: ({ at }) => `発表日程は企業の告知原文で確認しました(最終確認 ${at})。`,
};

const EN: Copy = {
  kicker: 'SIGNUM HQ · Earnings week',
  h1: (r) => `US earnings this week ${r} — the move options are pricing in`,
  lead: 'Only report dates the companies themselves announced. For each name: the options-implied move (ATM straddle) plus Max Pain, Call Wall and Put Floor, on one page. Free, no account.',
  metaTitle: (r) => `US Earnings This Week ${r} · Options-Implied Move · Max Pain | SIGNUM HQ`,
  metaDesc: ({ n, top, range }) => `${n} US reports for ${range} (company-announced dates): report day and time, the options-implied move, Max Pain, Call Wall and Put Floor.${top ? ` ${top}.` : ''} Free.`,
  topLine: ({ ticker, pct, when }) => `Biggest implied move this week: ${ticker} ${pct} (${when})`,
  topNone: 'Loading the implied-move data.',
  countLine: ({ n, done, left }) => `${n} companies with an announced date · ${done} reported · ${left} to go`,
  rolled: 'It is the weekend, so this shows next week.',
  asOfClose: ({ day }) => `Options numbers as of: New York ${day} closing quotes`,
  asOfLive: 'Options numbers as of: live in-session quotes',
  asOfAt: ({ ny, kst }) => `Computed NY ${ny} · Korea ${kst}`,
  asOfUnknown: 'Checking the as-of time of the options numbers.',
  col: { stock: 'Stock', when: 'Report (NY · Korea)', move: 'Implied move', price: 'Ref. price', maxPain: 'Max Pain', callWall: 'Call Wall', putFloor: 'Put Floor' },
  hourBmo: 'Before open', hourAmc: 'After close', hourNone: 'Time not announced',
  kstEvening: 'evening–night', kstDawn: 'early morning', kstLabel: 'Korea', etLabel: 'NY',
  done: 'Reported', today: 'Reports today',
  expiryTag: (md) => `${md} expiry`,
  sessionTag: (md) => `${md} session`,
  noData: 'Updating',
  empty: 'No company has announced a report date for this week yet. This fills in as announcements are confirmed.',
  pendingT: 'Date not yet confirmed',
  pendingNote: 'Left out of the table until the company announces it (the data vendor’s tentative dates):',
  readT: 'How to read these numbers',
  read: [
    ['Implied move', 'How big a move the options market is pricing in. It is the ATM straddle (call mid + put mid at the strike nearest the price) divided by the reference price, to the first expiry after the report. It includes ordinary movement up to that expiry as well as the report reaction, so it is not a forecast of the reaction.'],
    ['Max Pain · Call Wall · Put Floor', 'Computed from open interest on the same expiry. Max Pain is the strike where option buyers’ expiry value is lowest; Call Wall and Put Floor are the strikes with the heaviest call and put open interest above and below the price. They are short-term reference levels and say nothing about direction.'],
    ['Reference price and time', 'The reference price is the spot used in that calculation (the most recent trade). In the session it uses live quotes; when the market is closed it uses the last session’s closing quotes. Read it together with the as-of time above the table.'],
    ['Report time', 'When the company states a time we show New York and Korea time; otherwise only before-open (Korea: same evening–night) or after-close (Korea: next-day early morning).'],
  ],
  cta: 'Live options flow and Max Pain changes are in the app — 1 month of PRO free (auto-renews after; cancel anytime)',
  ctaSub: 'iOS · Android',
  ctaNote: 'The code is filled in for you.',
  share: 'Share this table', shareCopied: 'Link copied',
  shareTitle: (r) => `US earnings this week ${r}`,
  shareText: ({ n, top }) => `US earnings this week: ${n} companies (company-announced dates), the options-implied move and Max Pain on one page${top ? ` — ${top}` : ''}`,
  moreT: 'Also see', moreDp: 'Today’s dark pool leaders', moreOf: 'Unusual options activity today', moreAll: 'All tickers',
  disc: 'Information and education only. Not investment advice or a recommendation to buy or sell, and no guarantee of accuracy or results.',
  verified: ({ at }) => `Report dates were checked against the companies’ own announcements (last checked ${at}).`,
};

export const COPY: Record<Loc, Copy> = { ko: KO, ja: JA, en: EN };

/** 'YYYY-MM-DD' 범위 → '10/12(월)–10/16(금)' */
export function rangeText(start: string, end: string, loc: Loc): string {
  return `${mdw(start, loc)}–${mdw(end, loc)}`;
}

export const hourText = (hour: string, c: Copy): string => (hour === 'bmo' ? c.hourBmo : hour === 'amc' ? c.hourAmc : c.hourNone);

/** 금지 표현 — 투자 권유·확실·보장 (시험이 문구 전체를 훑는다). «보장하지 않습니다»처럼 부정으로 쓰는 고지 문장은 예외로 둔다. */
export const BANNED_WORDS: RegExp[] = [/확실/, /반드시\s*(오|상승|하락)/, /무조건/, /매수\s*추천/, /sure\s+thing/i, /\bguaranteed\b/i, /guarantees?\s+(profits?|returns?|gains?)/i, /must[- ]buy/i, /絶対/, /必ず(上|下|儲)/];

export { daysBetweenYmd };
