// ============================================================================
// 실적 캘린더 «관전 포인트»(AI 한 줄) — 문구의 숫자는 표와 «같은 값»에서만 나온다.
// ----------------------------------------------------------------------------
// 사고 (2026-10-04 운영 실측, 10/13 카드):
//   C   표 EPS $2.66  / 문구 «Q3 EPS $2.68»      GS  표 $14.44 / 문구 «$16.14 EPS»
//   JNJ 표 $2.78      / 문구 $2.88               BLK 표 $14.25 / 문구 $14.28
//   MU  표 $37.94(12/23 보고) / 문구 $31.16 — 9/23 보고(직전 분기) 때 쓴 글
//   COST 표 $4.89(12/10) / 문구 «Q4 EPS 6.53» — 직전 분기 글이 다음 분기 행에 붙었다
// 메커니즘 (cron/earnings-brief, 9/10~10/4):
//   ① 모델에게 그때의 추정치를 주고 «글자로» 인용하게 했다 → 숫자가 글 속에 얼었다.
//   ② 저장 키가 «티커»뿐이었다(earnings:brief:v2) — 어느 보고·어느 추정치로 쓴 글인지 없었다.
//   ③ 크론은 «없는 티커»만 만들었다 → 추정치가 바뀌어도, 다음 분기 행이 와도 다시 안 썼다.
//      묶음 전체를 다시 쓸 때마다 30일 TTL 이 갱신돼 옛 글이 끝없이 살았다.
//   ④ 응답 직전(라우트)에 티커로 붙이기만 하고 숫자를 대조하지 않았다.
// 그래서 (2026-10-04):
//   · 모델은 숫자 대신 {EPS}·{REV} 자리표만 쓴다 — 응답 직전에 «같은 행·같은 포맷»(아래 fmt*)으로 채운다.
//     화면 표(app-view/earnings)도 같은 fmt* 를 쓴다 → 글과 표가 갈라질 길이 없다.
//   · 저장 키는 «티커|보고일»(v3) — 다음 분기 행에는 옛 글이 붙지 않는다(새로 쓴다).
//   · 출구 검사: 채운 뒤에도 남은 금액·EPS·% 숫자가 표 값과 반올림 오차 밖이면 그 언어 문구를 내보내지 않는다.
//     (캐시 적중이든 아니든 모든 응답이 attachBriefs 를 지난다.)
// ⚠️ 클라이언트 번들에도 들어간다(fmt*) — 정규식에 lookbehind 를 쓰지 않는다(구형 iOS 웹뷰 구문 오류).
// ============================================================================

/** v2(티커 키·숫자 박힌 글)는 이 키로 바꾸며 버린다 — 더는 아무도 읽지 않는다 */
export const EARNINGS_BRIEF_KEY = 'earnings:brief:v3';
/** 글 하나 = 보고 하나. 같은 티커라도 보고일이 다르면 다른 글이다 */
export const briefEntryKey = (ticker: string, date: string): string => `${String(ticker).toUpperCase()}|${String(date).slice(0, 10)}`;

export const BRIEF_EPS_TOKEN = '{EPS}';
export const BRIEF_REV_TOKEN = '{REV}';
const TOKEN_RE = /\{+\s*(EPS|REV)\s*\}+/gi;

export type BriefLangCode = 'ko' | 'en' | 'ja';
export const BRIEF_LANGS: readonly BriefLangCode[] = ['ko', 'en', 'ja'];

export interface BriefRowNumbers {
  epsEstimate?: number | null;
  revenueEstimate?: number | null;
  /** 표의 분기 칩(Q3 FY26) — 알 때만 문구의 분기 표기와 대조한다 */
  quarter?: number | null;
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 표의 EPS 칸 글자 — 화면도 이 함수를 쓴다(글과 표가 같은 포맷) */
export function fmtEpsUsd(v: number | null | undefined): string {
  return fin(v) ? `$${v.toFixed(2)}` : '—';
}

/** 표의 매출 칸 글자 — 화면도 이 함수를 쓴다 */
export function fmtRevUsd(v: number | null | undefined): string {
  if (!fin(v)) return '—';
  return v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;
}

/**
 * {EPS}·{REV} 를 표 값으로 채운다.
 * 채울 값이 없거나(추정치 null) 모르는 중괄호가 남으면 null — 그 문구는 내보내지 않는다.
 */
export function fillBriefNumbers(text: string, row: BriefRowNumbers): string | null {
  let bad = false;
  const out = String(text ?? '').replace(TOKEN_RE, (_m, k: string) => {
    const isEps = k.toUpperCase() === 'EPS';
    const v = isEps ? row.epsEstimate : row.revenueEstimate;
    if (!fin(v)) { bad = true; return ''; }
    return isEps ? fmtEpsUsd(v) : fmtRevUsd(v);
  });
  if (bad || /[{}]/.test(out)) return null;
  return out;
}

// ── 문구 속 숫자 찾기 ────────────────────────────────────────────────────
export type BriefFigureKind = 'eps' | 'money' | 'pct';
export interface BriefFigure {
  raw: string;
  value: number;
  kind: BriefFigureKind;
  /** 쓰인 자릿수의 반올림 허용폭(마지막 자리 0.5단위) */
  step: number;
}

const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const EN_UNIT: Record<string, number> = {
  thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12,
  k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, t: 1e12, tn: 1e12,
};
const CJK_UNIT: Record<string, number> = { '만': 1e4, '万': 1e4, '억': 1e8, '億': 1e8, '조': 1e12, '兆': 1e12 };

const toNum = (s: string) => Number(String(s).replace(/,/g, ''));
const decimalsOf = (s: string) => { const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
const halfStep = (numStr: string, unit: number) => 0.5 * unit * Math.pow(10, -decimalsOf(numStr));

interface Matcher {
  re: RegExp;
  /** 앞 글자가 이 패턴이면 숫자로 보지 않는다(GPT-4.5 · v2.5 · H100 의 일부) */
  notAfter?: RegExp;
  build: (m: RegExpExecArray) => BriefFigure | null;
}

// 우선순위 순서 — 앞 패턴이 차지한 글자는 뒤 패턴이 다시 세지 않는다.
const MATCHERS: Matcher[] = [
  // 1) 퍼센트 — 표에 없는 숫자다(검증할 수 없다)
  {
    re: new RegExp(String.raw`(${NUM})\s*(?:%|퍼센트|パーセント)`, 'g'),
    build: (m) => ({ raw: m[0], value: toNum(m[1]), kind: 'pct', step: 0 }),
  },
  // 2) 달러 기호 — «$2.66» «$-0.69»(fmtEpsUsd 음수) «-$0.69» «$23.7B» «$23.7 billion» «$1.6M» «$237억»
  //    한 글자 단위(B/M/K/T)는 숫자에 «붙어» 있을 때만 — «$2.66 M&A» 의 M 은 단위가 아니다
  {
    re: new RegExp(
      String.raw`(-)?\$\s?(-)?(${NUM})(?:\s*(trillion|billion|million|thousand|bn|mn|tn)\b|([BMKT])(?![A-Za-z&])|\s*([조억만兆億万]))?`,
      'g',
    ),
    build: (m) => {
      const neg = !!(m[1] || m[2]);
      const word = (m[4] || m[5] || '').toLowerCase();
      const unit = word ? EN_UNIT[word] ?? 1 : m[6] ? CJK_UNIT[m[6]] : 1;
      const v = toNum(m[3]) * unit * (neg ? -1 : 1);
      const kind: BriefFigureKind = unit > 1 || Math.abs(v) >= 1000 ? 'money' : 'eps';
      return { raw: m[0], value: v, kind, step: halfStep(m[3], unit) };
    },
  },
  // 3) 한·일 큰 단위 금액 — «237억 달러» «2,370億ドル» «1조 5,000억 달러» «165만 달러»
  {
    re: new RegExp(String.raw`(${NUM})\s*([조억兆億])(?:\s*(${NUM})\s*([억億만万]))?(?:\s*(달러|ドル))?|(${NUM})\s*([만万])\s*(달러|ドル)`, 'g'),
    build: (m) => {
      if (m[6]) {
        const unit = CJK_UNIT[m[7]];
        return { raw: m[0], value: toNum(m[6]) * unit, kind: 'money', step: halfStep(m[6], unit) };
      }
      const big = CJK_UNIT[m[2]];
      let v = toNum(m[1]) * big;
      let step = halfStep(m[1], big);
      if (m[3] && m[4]) {
        const small = CJK_UNIT[m[4]];
        v += toNum(m[3]) * small;
        step = halfStep(m[3], small);
      }
      return { raw: m[0], value: v, kind: 'money', step };
    },
  },
  // 4) 통화 단어 — «2.66달러» «2.66ドル» «2.66 dollars» «USD 2.66»
  {
    // «불»은 넣지 않는다 — «불확실성»의 불을 통화로 읽는다
    re: new RegExp(String.raw`(-)?(${NUM})\s*(?:달러|ドル|dollars?\b|USD\b)|USD\s?(-)?(${NUM})`, 'gi'),
    build: (m) => {
      const s = m[2] ?? m[4];
      const v = toNum(s) * (m[1] || m[3] ? -1 : 1);
      return { raw: m[0], value: v, kind: Math.abs(v) >= 1000 ? 'money' : 'eps', step: halfStep(s, 1) };
    },
  },
  // 5) EPS 낱말 바로 뒤 숫자 — «EPS 6.53» «EPS 추정치 2» «1株当たり利益2.66»
  {
    re: new RegExp(
      String.raw`(?:EPS|주당\s*순이익|주당\s*이익|1株(?:当たり)?(?:純)?利益)\s*(?:추정치|추정|予想|estimates?|of|is|at|:)?\s*(-)?(${NUM})(?![\d.]*\s*(?:%|배|倍|x\b))`,
      'gi',
    ),
    build: (m) => {
      const v = toNum(m[2]) * (m[1] ? -1 : 1);
      return { raw: m[0], value: v, kind: Math.abs(v) >= 1000 ? 'money' : 'eps', step: halfStep(m[2], 1) };
    },
  },
  // 6) 달러 기호 없는 영어 단위 금액 — «16 billion» «1.6M» (한 글자 단위는 소수일 때만: 3M·5G 는 이름이다)
  {
    re: new RegExp(String.raw`(-)?(${NUM})\s*(trillion|billion|million|bn|mn|tn)\b|(-)?(\d+\.\d+)([BMKT])(?![A-Za-z&])`, 'gi'),
    notAfter: /[A-Za-z0-9.\-$_]/,
    build: (m) => {
      const s = m[2] ?? m[5];
      const unit = EN_UNIT[(m[3] || m[6] || '').toLowerCase()] ?? 1;
      const v = toNum(s) * unit * (m[1] || m[4] ? -1 : 1);
      return { raw: m[0], value: v, kind: 'money', step: halfStep(s, unit) };
    },
  },
  // 7) 맨 소수 — «AEP 1.98 달성» «0.41을 좌우» (이 화면 글의 소수는 전부 EPS 인용이었다)
  //    «2.5배» «1.5x» 배수 · «1.6nm» 처럼 영문 단위가 붙은 것은 제외 · 앞이 글자·하이픈·점이면(GPT-4.5) 제외
  {
    re: /(-)?(\d+\.\d+)(?!\d|[A-Za-z]|\s*(?:배|倍|x\b|×))/g,
    notAfter: /[A-Za-z0-9.\-$_]/,
    build: (m) => {
      const v = toNum(m[2]) * (m[1] ? -1 : 1);
      return { raw: m[0], value: v, kind: Math.abs(v) >= 1000 ? 'money' : 'eps', step: halfStep(m[2], 1) };
    },
  },
];

/** 문구 속 금액·EPS·% 숫자. 제품명 속 정수(737 MAX · 5G · GLP-1 · 5nm)는 세지 않는다 */
export function briefFigures(text: string): BriefFigure[] {
  const s = String(text ?? '');
  const taken: Array<[number, number]> = [];
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x);
  const out: Array<{ f: BriefFigure; at: number }> = [];
  for (const mt of MATCHERS) {
    mt.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = mt.re.exec(s))) {
      if (m[0].length === 0) { mt.re.lastIndex++; continue; }
      const a = m.index, b = m.index + m[0].length;
      if (overlaps(a, b)) continue;
      if (mt.notAfter && a > 0 && mt.notAfter.test(s[a - 1])) continue;
      const f = mt.build(m);
      if (!f || !Number.isFinite(f.value)) continue;
      taken.push([a, b]);
      out.push({ f: { ...f, raw: f.raw.trim() }, at: a });
    }
  }
  return out.sort((x, y) => x.at - y.at).map((x) => x.f);
}

export interface BriefCheck { ok: boolean; reason: string | null }

/** «Q3» «3분기» «第3四半期» — \b 는 ASCII 기준이라 «Q3는»도 잡힌다 */
const QUARTER_RE = /\bQ([1-4])\b|([1-4])\s*분기|第?([1-4])\s*四半期/g;

/**
 * 문구 속 숫자가 전부 표 값과 맞는가 — EPS 는 epsEstimate, 금액은 revenueEstimate 와
 * «쓰인 자릿수의 반올림 오차» 안이어야 한다. % 는 표에 없는 숫자라 통과시키지 않는다.
 */
export function checkBriefNumbers(text: string, row: BriefRowNumbers): BriefCheck {
  // 분기 표기 — 표가 분기를 알 때 문구의 «Q4»가 표의 «Q1»과 다르면 안 된다(COST 12/10 행에 «Q4 EPS 6.53»)
  if (fin(row.quarter)) {
    for (const m of String(text ?? '').matchAll(QUARTER_RE)) {
      const q = Number(m[1] || m[2] || m[3]);
      if (q !== row.quarter) return { ok: false, reason: `quarter:${m[0].trim()}≠Q${row.quarter}` };
    }
  }
  for (const f of briefFigures(text)) {
    if (f.kind === 'pct') return { ok: false, reason: `unverifiable:${f.raw}` };
    const ref = f.kind === 'eps' ? row.epsEstimate : row.revenueEstimate;
    if (!fin(ref)) return { ok: false, reason: `no-ref:${f.raw}` };
    const tol = f.step + 1e-9 * Math.max(1, Math.abs(ref));
    if (Math.abs(f.value - ref) > tol) return { ok: false, reason: `mismatch:${f.raw}≠${f.kind === 'eps' ? fmtEpsUsd(ref) : fmtRevUsd(ref)}` };
  }
  return { ok: true, reason: null };
}

/**
 * 크론이 «저장 전»에 쓰는 검사 — 새 글에는 글자 숫자가 아예 없어야 한다(자리표만).
 * 숫자를 글자로 박으면 추정치가 바뀌는 순간 표와 어긋난다(이번 사고의 ①).
 */
export function briefDraftOk(watch: string, row: BriefRowNumbers): BriefCheck {
  const lit = briefFigures(watch);
  if (lit.length) return { ok: false, reason: `literal:${lit[0].raw}` };
  const filled = fillBriefNumbers(watch, row);
  if (filled == null) return { ok: false, reason: 'token-unfillable' };
  return checkBriefNumbers(filled, row);
}

// ── 응답 직전에 행에 붙이기(라우트 출구 — 모든 응답이 여기를 지난다) ─────
export interface BriefCell { name?: string; watch?: string }
export interface BriefEntry {
  ko?: BriefCell; en?: BriefCell; ja?: BriefCell;
  /** 이 글을 쓸 때 모델이 본 행 — 다음에 «무엇으로 썼나»를 되물을 수 있게 */
  for?: { date: string; eps: number | null; rev: number | null; quarter: number | null; year: number | null };
  at?: string;
}
export interface BriefPack {
  generatedAt?: string;
  source?: string;
  model?: string;
  entries?: Record<string, BriefEntry>;
}

export interface BriefAttachRow extends BriefRowNumbers {
  ticker: string;
  date: string;
}

export function attachBriefs<R extends BriefAttachRow>(
  rows: R[],
  pack: BriefPack | null | undefined,
): { rows: Array<R & { brief?: Partial<Record<BriefLangCode, BriefCell>> }>; aiCount: number; blocked: number; blockedSample: string[] } {
  const entries = pack?.entries;
  if (!entries || typeof entries !== 'object') return { rows, aiCount: 0, blocked: 0, blockedSample: [] };
  let aiCount = 0, blocked = 0;
  const blockedSample: string[] = [];
  const merged = rows.map((r) => {
    const e = entries[briefEntryKey(r.ticker, r.date)];
    if (!e) return r;
    const brief: Partial<Record<BriefLangCode, BriefCell>> = {};
    let anyWatch = false;
    for (const lang of BRIEF_LANGS) {
      const cell = e[lang];
      if (!cell || typeof cell !== 'object') continue;
      const name = typeof cell.name === 'string' && cell.name.trim() ? cell.name.trim() : undefined;
      let watch: string | undefined;
      if (typeof cell.watch === 'string' && cell.watch.trim()) {
        const filled = fillBriefNumbers(cell.watch.trim(), r);
        const chk = filled == null ? { ok: false, reason: 'token-unfillable' } : checkBriefNumbers(filled, r);
        if (filled != null && chk.ok) { watch = filled; anyWatch = true; }
        else {
          blocked++;
          if (blockedSample.length < 8) blockedSample.push(`${r.ticker}|${r.date}/${lang}:${chk.reason}`);
        }
      }
      if (name || watch) brief[lang] = watch ? { ...(name ? { name } : {}), watch } : { name };
    }
    if (!Object.keys(brief).length) return r;
    if (anyWatch) aiCount++;
    return { ...r, brief };
  });
  return { rows: merged, aiCount, blocked, blockedSample };
}
