'use client';

// ============================================================================
// 기관 레이더 (Level Radar) — 4th spinoff PROTOTYPE · v3 "Daybreak + tabs"
// (2026-07-20: Spotify liveliness × Acorns light premium; ticker logos, visual
// > text, rich but not heavy.) Four tabs give the app depth & habit surface:
//   홈 온도  — market temperature gauge + component chips + today's signals
//   레이더    — watchlist × dealer-level proximity (filters, spark, add)
//   탐색      — market-wide rankings from our data (level-near / dark-pool / squeeze)
//   나        — daily check-in streak (habit), watchlist manage, language
// Real data via /api/wim/lab (15-min SWR). Compliance: observer language only.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type Lang = 'ko' | 'en' | 'ja';
type Tab = 'home' | 'radar' | 'discover' | 'me';

interface Lab {
  ticker: string;
  price: number | null;
  spark: { closes: number[] } | null;
  gex: { netGex: number | null; gammaFlip: number | null; regime: string | null };
  levels: { callWall: number | null; putFloor: number | null; maxPain: number | null };
  pcr: number | null;
  darkPoolPct: number | null;
  shortVolPct: number | null;
  squeeze: { riskScore: number | null };
}

const T: Record<Lang, Record<string, string>> = {
  ko: {
    app: '기관 레이더', tag: '시장 온도 · 딜러 레벨 · 3초 체크',
    tabHome: '온도', tabRadar: '레이더', tabDiscover: '탐색', tabMe: '나',
    tempTitle: '오늘 시장 온도', live: '실데이터', loading: '기관 데이터 수신 중…',
    b0: '냉각', b1: '서늘', b2: '중립', b3: '온기', b4: '과열',
    cap0: '풋이 콜보다 많고({pcr}) 숏볼륨 {sv}% — 방어적인 자금 흐름이 관찰돼요',
    cap1: '옵션 수요가 조심스러운 쪽({pcr})으로 기울어 있어요',
    cap2: '풋·콜이 균형({pcr}) — 뚜렷한 쏠림 없는 상태예요',
    cap3: '콜 수요가 앞서고({pcr}) 변동 억제 구간 — 온기가 관찰돼요',
    cap4: '콜 쏠림({pcr})이 강해요 — 과열 신호들이 관찰돼요',
    compPcr: '풋/콜', compGex: '감마', compDp: '다크풀', compSv: '숏볼륨',
    gexPos: '억제 +', gexNeg: '증폭 −',
    fAll: '전체', fTouch: '터치권', fNear: '근접',
    sigTitle: '오늘의 시그널', sigSub: '레벨 0.5% 이내 · 앱에선 푸시로',
    sigNone: '지금 레벨권에 든 종목이 없어요 — 조용한 장이에요',
    toLevel: '{l}까지', nearest: '최근접',
    callWall: '콜월', maxPain: '맥스페인', gammaFlip: '감마플립', putFloor: '풋플로어', last: '현재가',
    touch: '터치권', near: '근접', watch: '관망',
    radarTitle: '레벨 레이더', radarSub: '내 종목 ↔ 기관 레벨 거리',
    wlPh: '티커 추가 (예: NVDA)', wlAdd: '추가', wlDup: '이미 있어요', wlBad: '데이터를 찾지 못했어요', wlMax: '프로토타입은 10개까지', wlEmpty: '아래에서 종목을 추가해 보세요',
    del: '삭제', close: '닫기', ladder: '레벨 사다리', spark5: '오늘 실제 세션',
    discTitle: '시장 탐색', discSub: '실데이터로 뽑은 오늘의 상위 종목',
    rankLevel: '레벨 근접 TOP', rankLevelSub: '기관 레벨에 가장 가까운', rankDark: '다크풀 활발 TOP', rankDarkSub: '장외 거래 비중 높은', rankSqueeze: '스퀴즈 압력 TOP', rankSqueezeSub: '숏 스퀴즈 리스크 높은',
    addToWl: '워치리스트에 담기', added: '담김',
    meTitle: '나의 레이더', checkinTitle: '연속 체크인', checkinSub: '매일 3초, 시장 온도 확인 습관', days: '일',
    manageTitle: '워치리스트 관리', langTitle: '언어', aboutTitle: '앱 정보',
    disc: '교육용 시장 정보입니다. 투자 조언이 아니며 정확성을 보장하지 않습니다.',
    proto: '프로토타입', by: 'by SIGNUM HQ', lang: '언어',
  },
  en: {
    app: 'Level Radar', tag: 'Market temp · dealer levels · 3-sec check',
    tabHome: 'Temp', tabRadar: 'Radar', tabDiscover: 'Discover', tabMe: 'Me',
    tempTitle: "Today's market temperature", live: 'LIVE', loading: 'Receiving institutional data…',
    b0: 'Cold', b1: 'Cool', b2: 'Neutral', b3: 'Warm', b4: 'Hot',
    cap0: 'Puts outnumber calls ({pcr}) with short volume {sv}% — defensive flow observed',
    cap1: 'Options demand leans cautious ({pcr})',
    cap2: 'Puts and calls balanced ({pcr}) — no clear tilt',
    cap3: 'Call demand leads ({pcr}) in a damped-vol regime — warmth observed',
    cap4: 'Heavy call tilt ({pcr}) — overheating signals observed',
    compPcr: 'Put/Call', compGex: 'Gamma', compDp: 'Dark pool', compSv: 'Short vol',
    gexPos: 'Damped +', gexNeg: 'Amplified −',
    fAll: 'All', fTouch: 'At level', fNear: 'Near',
    sigTitle: "Today's signals", sigSub: 'Within 0.5% · push in the app',
    sigNone: 'Nothing in level range — a quiet tape',
    toLevel: 'to {l}', nearest: 'Nearest',
    callWall: 'Call wall', maxPain: 'Max pain', gammaFlip: 'Gamma flip', putFloor: 'Put floor', last: 'Last',
    touch: 'At level', near: 'Near', watch: 'Quiet',
    radarTitle: 'Level radar', radarSub: 'Your tickers ↔ dealer levels',
    wlPh: 'Add ticker (e.g. NVDA)', wlAdd: 'Add', wlDup: 'Already added', wlBad: 'No data found', wlMax: 'Prototype caps at 10', wlEmpty: 'Add a ticker below to get started',
    del: 'Remove', close: 'Close', ladder: 'Level ladder', spark5: "Today's real session",
    discTitle: 'Discover', discSub: "Today's leaders, ranked on real data",
    rankLevel: 'Nearest to a level', rankLevelSub: 'closest to a dealer level', rankDark: 'Dark-pool active', rankDarkSub: 'highest off-exchange share', rankSqueeze: 'Squeeze pressure', rankSqueezeSub: 'highest short-squeeze risk',
    addToWl: 'Add to watchlist', added: 'Added',
    meTitle: 'My radar', checkinTitle: 'Check-in streak', checkinSub: 'A 3-second temperature check, daily', days: 'days',
    manageTitle: 'Manage watchlist', langTitle: 'Language', aboutTitle: 'About',
    disc: 'Educational market information only. Not investment advice; accuracy not guaranteed.',
    proto: 'prototype', by: 'by SIGNUM HQ', lang: 'Language',
  },
  ja: {
    app: 'レベルレーダー', tag: '市場温度 · ディーラーレベル · 3秒チェック',
    tabHome: '温度', tabRadar: 'レーダー', tabDiscover: '探索', tabMe: 'マイ',
    tempTitle: '今日の市場温度', live: 'ライブ', loading: '機関データ受信中…',
    b0: '冷却', b1: '涼しい', b2: '中立', b3: '温かい', b4: '過熱',
    cap0: 'プットがコールを上回り({pcr})、空売り出来高{sv}% — 防御的な資金フローが観測されます',
    cap1: 'オプション需要は慎重寄り({pcr})です',
    cap2: 'プット・コールは均衡({pcr}) — 明確な偏りなし',
    cap3: 'コール需要が先行({pcr})し、変動抑制の状態 — 温かさが観測されます',
    cap4: 'コールへの偏り({pcr})が強い — 過熱シグナルが観測されます',
    compPcr: 'P/C', compGex: 'ガンマ', compDp: 'ダークプール', compSv: '空売り',
    gexPos: '抑制 +', gexNeg: '増幅 −',
    fAll: 'すべて', fTouch: 'レベル圏', fNear: '接近',
    sigTitle: '今日のシグナル', sigSub: 'レベルまで0.5%以内 · アプリではプッシュ',
    sigNone: '現在レベル圏の銘柄なし — 静かな相場です',
    toLevel: '{l}まで', nearest: '最寄り',
    callWall: 'コールウォール', maxPain: 'マックスペイン', gammaFlip: 'ガンマフリップ', putFloor: 'プットフロア', last: '現在値',
    touch: 'レベル圏', near: '接近', watch: '静観',
    radarTitle: 'レベルレーダー', radarSub: '保有銘柄 ↔ 機関レベルの距離',
    wlPh: 'ティッカー追加 (例: NVDA)', wlAdd: '追加', wlDup: '追加済み', wlBad: 'データ未検出', wlMax: '試作版は10件まで', wlEmpty: '下から銘柄を追加してください',
    del: '削除', close: '閉じる', ladder: 'レベルラダー', spark5: '本日の実セッション',
    discTitle: '市場探索', discSub: '実データで選んだ本日の上位銘柄',
    rankLevel: 'レベル接近 TOP', rankLevelSub: '機関レベルに最も近い', rankDark: 'ダークプール活発 TOP', rankDarkSub: '市場外取引の比率が高い', rankSqueeze: 'スクイーズ圧力 TOP', rankSqueezeSub: '空売りスクイーズ risk が高い',
    addToWl: 'ウォッチリストに追加', added: '追加済み',
    meTitle: 'マイレーダー', checkinTitle: '連続チェックイン', checkinSub: '毎日3秒、市場温度の確認習慣', days: '日',
    manageTitle: 'ウォッチリスト管理', langTitle: '言語', aboutTitle: 'アプリ情報',
    disc: '教育目的の市場情報です。投資助言ではなく、正確性は保証されません。',
    proto: 'プロトタイプ', by: 'by SIGNUM HQ', lang: '言語',
  },
};

// ── Daybreak palette ──
const C = {
  ink: '#16283A', sub: '#5B7288', faint: '#94A7B8',
  cyan: '#0FB5CB', cyanDeep: '#0891B0', cyanSoft: 'rgba(15,181,203,0.10)',
  amber: '#F59E0B', amberDeep: '#B45309', amberSoft: '#FFF3D6',
  mint: '#10B981', mintSoft: 'rgba(16,185,129,0.11)',
  violet: '#7C6CF0', violetSoft: 'rgba(124,108,240,0.11)',
  coral: '#F0644A', coralSoft: 'rgba(240,100,74,0.10)',
  navy: '#23445E', navySoft: 'rgba(35,68,94,0.08)',
  card: '#FFFFFF', line: 'rgba(22,40,58,0.08)',
  shadow: '0 14px 34px rgba(22,40,58,0.09), 0 3px 10px rgba(22,40,58,0.05)',
};

const DEFAULT_WL = ['NVDA', 'TSLA', 'AAPL', 'SPY', 'QQQ', 'META'];
const MARKET_REF = ['SPY', 'QQQ'];
// curated liquid universe for the Discover rankings (lazy-loaded on tab open)
const DISCOVER_UNIVERSE = ['NVDA', 'TSLA', 'AAPL', 'AMD', 'META', 'AMZN', 'MSFT', 'PLTR', 'COIN', 'MSTR', 'SMCI', 'AVGO', 'NFLX', 'GOOGL', 'MU', 'SOFI'];
const ETF_SET = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'ARKK', 'SOXL', 'SOXX', 'SMH', 'TQQQ', 'SQQQ', 'TLT', 'GLD', 'SLV', 'USO', 'XLE', 'XLF', 'XLK', 'XLV']);

const fmtD = (p: number) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%`;
function etDateStr(ms = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
}

interface LevelHit { key: 'callWall' | 'maxPain' | 'gammaFlip' | 'putFloor'; value: number; distPct: number }

function nearestLevel(lab: Lab): LevelHit | null {
  if (lab.price == null || lab.price <= 0) return null;
  const cands: LevelHit[] = [];
  const push = (key: LevelHit['key'], v: number | null) => {
    if (v != null && v > 0) cands.push({ key, value: v, distPct: ((v - (lab.price as number)) / (lab.price as number)) * 100 });
  };
  push('callWall', lab.levels.callWall);
  push('maxPain', lab.levels.maxPain);
  push('gammaFlip', lab.gex.gammaFlip);
  push('putFloor', lab.levels.putFloor);
  if (!cands.length) return null;
  return cands.sort((a, b) => Math.abs(a.distPct) - Math.abs(b.distPct))[0];
}

function temperature(labs: Lab[]): { score: number; pcr: number | null; gexPos: boolean | null; dp: number | null; sv: number | null } {
  const ok = labs.filter((l) => l.price != null);
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const pcr = avg(ok.map((l) => l.pcr));
  const dp = avg(ok.map((l) => l.darkPoolPct));
  const sv = avg(ok.map((l) => l.shortVolPct));
  const gexVals = ok.map((l) => l.gex.netGex).filter((x): x is number => x != null);
  const gexPos = gexVals.length ? gexVals.reduce((s, x) => s + x, 0) > 0 : null;
  let score = 50;
  if (pcr != null) score += Math.max(-20, Math.min(20, (0.95 - pcr) * 45));
  if (gexPos != null) score += gexPos ? 9 : -13;
  if (sv != null) score += Math.max(-12, Math.min(12, (44 - sv) * 0.7));
  return { score: Math.round(Math.max(5, Math.min(95, score))), pcr, gexPos, dp, sv };
}

function TickerLogo({ ticker, size = 34 }: { ticker: string; size?: number }) {
  const [errored, setErrored] = useState(false);
  const failed = errored || ETF_SET.has(ticker);
  const box = {
    width: size, height: size, minWidth: size, borderRadius: '50%', flexShrink: 0,
    overflow: 'hidden', background: '#fff', border: `1.5px solid ${C.line}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 6px rgba(22,40,58,0.08)',
  } as const;
  if (failed) {
    return <span aria-hidden style={{ ...box, background: C.cyanSoft, color: C.cyanDeep, fontSize: Math.round(size * 0.42), fontWeight: 900 }}>{ticker.slice(0, ETF_SET.has(ticker) ? 3 : 1)}</span>;
  }
  return (
    <span aria-hidden style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/undercurrent/logo?t=${ticker}`} alt="" onError={() => setErrored(true)} style={{ width: '74%', height: '74%', objectFit: 'contain', display: 'block' }} />
    </span>
  );
}

function MiniSpark({ closes, w = 76, h = 28, color = C.cyan }: { closes: number[]; w?: number; h?: number; color?: string }) {
  if (closes.length < 2) return null;
  const min = Math.min(...closes), max = Math.max(...closes), span = max - min || 1;
  const pts = closes.map((v, i) => `${(i / (closes.length - 1)) * w},${h - ((v - min) / span) * (h - 5) - 2.5}`).join(' ');
  const gid = `sg-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`${pts}`} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gid})`} stroke="none" />
    </svg>
  );
}

function Gauge({ score, band }: { score: number; band: string }) {
  const a = (-90 + (score / 100) * 180) * (Math.PI / 180);
  const R = 108, cx = 140, cy = 138;
  const nx = cx + Math.sin(a) * (R - 24), ny = cy - Math.cos(a) * (R - 24);
  const bandColor = score < 45 ? '#3E6BFF' : score < 58 ? C.cyan : score < 75 ? C.amber : C.coral;
  return (
    <svg width="280" height="158" viewBox="0 0 280 158" style={{ display: 'block', margin: '0 auto' }}>
      <defs>
        <linearGradient id="rg2" x1="0" y1="1" x2="1" y2="1">
          <stop offset="0" stopColor="#3E6BFF" /><stop offset="0.45" stopColor={C.cyan} />
          <stop offset="0.75" stopColor={C.amber} /><stop offset="1" stopColor={C.coral} />
        </linearGradient>
      </defs>
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="rgba(22,40,58,0.07)" strokeWidth="15" strokeLinecap="round" />
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="url(#rg2)" strokeWidth="15" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * Math.PI * R} ${Math.PI * R}`} opacity="0.95" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={C.ink} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6.5" fill={C.ink} /><circle cx={cx} cy={cy} r="2.6" fill="#fff" />
      <text x={cx} y={cy - 36} textAnchor="middle" fill={C.ink} fontSize="42" fontWeight="800" fontFamily="inherit">{score}</text>
      <text x={cx} y={cy - 14} textAnchor="middle" fill={bandColor} fontSize="14.5" fontWeight="800" fontFamily="inherit" letterSpacing="3">{band}</text>
    </svg>
  );
}

const NAV_ICON: Record<Tab, string> = {
  home: 'M4.5 11 12 4.6 19.5 11M6.3 9.6v9a1.4 1.4 0 0 0 1.4 1.4h8.6a1.4 1.4 0 0 0 1.4-1.4v-9',
  radar: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8ZM12 12l6-6',
  discover: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.4 5.6-2 4.8-4.8 2 2-4.8 4.8-2Z',
  me: 'M12 3.6a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM5 20c.6-3.8 3.4-5.8 7-5.8s6.4 2 7 5.8',
};

export default function RadarPage() {
  const params = useParams<{ locale: string }>();
  const loc: Lang = params?.locale === 'en' ? 'en' : params?.locale === 'ja' ? 'ja' : 'ko';
  const t = T[loc];

  const [tab, setTab] = useState<Tab>('home');
  const [wl, setWl] = useState<string[]>(DEFAULT_WL);
  const [labs, setLabs] = useState<Record<string, Lab>>({});
  const [loaded, setLoaded] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [wlMsg, setWlMsg] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'touch' | 'near'>('all');
  const [streak, setStreak] = useState(0);
  const [discLoaded, setDiscLoaded] = useState(false);

  // ── daily check-in streak (habit lock-in) ──
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('radar.wl') || 'null');
      if (Array.isArray(saved) && saved.length) setWl(saved.slice(0, 10));
      const today = etDateStr();
      const last = localStorage.getItem('radar.checkin.last');
      let s = parseInt(localStorage.getItem('radar.checkin.streak') || '0', 10) || 0;
      if (last !== today) {
        s = last === etDateStr(Date.now() - 86_400_000) ? s + 1 : 1;
        localStorage.setItem('radar.checkin.last', today);
        localStorage.setItem('radar.checkin.streak', String(s));
      } else if (s < 1) { s = 1; localStorage.setItem('radar.checkin.streak', '1'); }
      setStreak(s);
    } catch { /* noop */ }
  }, []);

  const fetchLab = useCallback(async (tk: string): Promise<Lab | null> => {
    try {
      const r = await fetch(`/api/wim/lab?t=${encodeURIComponent(tk)}`);
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.ticker ? (j as Lab) : null;
    } catch { return null; }
  }, []);

  const loadMany = useCallback(async (tickers: string[]) => {
    const pairs = await Promise.all(tickers.map(async (tk) => [tk, await fetchLab(tk)] as const));
    setLabs((prev) => { const next = { ...prev }; pairs.forEach(([tk, lb]) => { if (lb) next[tk] = lb; }); return next; });
  }, [fetchLab]);

  useEffect(() => {
    let alive = true;
    const want = Array.from(new Set([...wl, ...MARKET_REF]));
    Promise.all(want.map(async (tk) => [tk, await fetchLab(tk)] as const)).then((pairs) => {
      if (!alive) return;
      setLabs((prev) => { const next = { ...prev }; pairs.forEach(([tk, lb]) => { if (lb) next[tk] = lb; }); return next; });
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [wl, fetchLab]);

  // lazy-load the discover universe the first time that tab is opened
  useEffect(() => {
    if (tab === 'discover' && !discLoaded) { setDiscLoaded(true); void loadMany(DISCOVER_UNIVERSE); }
  }, [tab, discLoaded, loadMany]);

  const temp = useMemo(() => temperature(MARKET_REF.map((tk) => labs[tk]).filter(Boolean) as Lab[]), [labs]);
  const bandIdx = temp.score < 30 ? 0 : temp.score < 45 ? 1 : temp.score < 58 ? 2 : temp.score < 75 ? 3 : 4;
  const band = [t.b0, t.b1, t.b2, t.b3, t.b4][bandIdx];
  const caption = temp.pcr != null
    ? [t.cap0, t.cap1, t.cap2, t.cap3, t.cap4][bandIdx].replace('{pcr}', temp.pcr.toFixed(2)).replace('{sv}', temp.sv != null ? String(Math.round(temp.sv)) : '—')
    : null;

  const rows = useMemo(() => wl
    .map((tk) => ({ tk, lab: labs[tk] as Lab | undefined }))
    .map(({ tk, lab }) => ({ tk, lab, hit: lab ? nearestLevel(lab) : null }))
    .sort((a, b) => (a.hit ? Math.abs(a.hit.distPct) : 99) - (b.hit ? Math.abs(b.hit.distPct) : 99)), [wl, labs]);

  const signals = rows.filter((r) => r.hit && Math.abs(r.hit.distPct) <= 0.5);
  const shown = rows.filter((r) => filter === 'all' ? true
    : filter === 'touch' ? (r.hit && Math.abs(r.hit.distPct) <= 0.5)
      : (r.hit && Math.abs(r.hit.distPct) <= 1.5));

  const uni = useMemo(() => DISCOVER_UNIVERSE.map((tk) => labs[tk]).filter((l): l is Lab => !!l && l.price != null), [labs]);
  const rankLevel = useMemo(() => uni.map((l) => ({ l, hit: nearestLevel(l) })).filter((x) => x.hit).sort((a, b) => Math.abs((a.hit as LevelHit).distPct) - Math.abs((b.hit as LevelHit).distPct)).slice(0, 5), [uni]);
  const rankDark = useMemo(() => uni.filter((l) => l.darkPoolPct != null).sort((a, b) => (b.darkPoolPct as number) - (a.darkPoolPct as number)).slice(0, 5), [uni]);
  const rankSqueeze = useMemo(() => uni.filter((l) => l.squeeze?.riskScore != null).sort((a, b) => (b.squeeze.riskScore as number) - (a.squeeze.riskScore as number)).slice(0, 5), [uni]);

  const addTicker = async (fromTk?: string) => {
    const tk = (fromTk || input).trim().toUpperCase();
    if (!/^[A-Z]{1,6}$/.test(tk)) return;
    if (wl.includes(tk)) { setWlMsg(t.wlDup); return; }
    if (wl.length >= 10) { setWlMsg(t.wlMax); return; }
    if (!fromTk) setWlMsg('…');
    const lb = labs[tk] || await fetchLab(tk);
    if (!lb || lb.price == null) { setWlMsg(t.wlBad); return; }
    const next = [...wl, tk];
    setWl(next); setInput(''); setWlMsg('');
    try { localStorage.setItem('radar.wl', JSON.stringify(next)); } catch { /* noop */ }
  };
  const rmTicker = (tk: string) => {
    const next = wl.filter((x) => x !== tk);
    setWl(next);
    try { localStorage.setItem('radar.wl', JSON.stringify(next)); } catch { /* noop */ }
  };

  const levelName: Record<LevelHit['key'], string> = { callWall: t.callWall, maxPain: t.maxPain, gammaFlip: t.gammaFlip, putFloor: t.putFloor };
  const chipFor = (d: number | null) => d == null ? { label: t.watch, color: C.faint, bg: 'rgba(148,167,184,0.13)' }
    : Math.abs(d) <= 0.5 ? { label: t.touch, color: C.amberDeep, bg: C.amberSoft }
      : Math.abs(d) <= 1.5 ? { label: t.near, color: C.cyanDeep, bg: C.cyanSoft }
        : { label: t.watch, color: C.faint, bg: 'rgba(148,167,184,0.13)' };

  const dLab = detail ? labs[detail] : null;

  const sectionHead = (title: string, sub: string) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 3px' }}>
      <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 850 }}>{title}</h2>
      <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: C.faint }}>{sub}</span>
    </div>
  );

  const rankCard = (title: string, sub: string, items: Lab[], accent: string, valueOf: (l: Lab) => string) => (
    <section style={{ marginTop: 15, background: C.card, borderRadius: 22, padding: '14px 14px 8px', boxShadow: C.shadow }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 3, background: accent }} />
        <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 900 }}>{title}</h3>
        <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: C.faint }}>{sub}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: '14px 0', textAlign: 'center', color: C.faint, fontSize: 11, fontWeight: 700 }}>{t.loading}</div>
      ) : items.map((l, i) => (
        <button key={l.ticker} type="button" onClick={() => setDetail(l.ticker)} style={{ font: 'inherit', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', padding: '9px 2px', borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
          <span style={{ width: 16, fontSize: 11, fontWeight: 900, color: C.faint }}>{i + 1}</span>
          <TickerLogo ticker={l.ticker} size={30} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 900 }}>{l.ticker}</span>
            <span style={{ display: 'block', fontSize: 10.5, fontWeight: 750, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>{l.price != null ? `$${l.price.toFixed(2)}` : ''}</span>
          </span>
          {l.spark && l.spark.closes.length >= 8 && <MiniSpark closes={l.spark.closes} color={accent} w={56} h={24} />}
          <span style={{ fontSize: 13, fontWeight: 900, color: accent, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{valueOf(l)}</span>
        </button>
      ))}
    </section>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #EAF4FA 0%, #F6FAFD 34%, #FDF8F1 100%)', color: C.ink, fontFamily: "-apple-system,'SF Pro','Inter','Pretendard',sans-serif" }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 16px calc(96px + env(safe-area-inset-bottom))' }}>

        {/* masthead */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'calc(14px + env(safe-area-inset-top))' }}>
          <span aria-hidden style={{ width: 42, height: 42, borderRadius: 14, background: C.card, boxShadow: C.shadow, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="25" height="25" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" fill="none" stroke={C.cyan} strokeWidth="1.5" opacity="0.4" />
              <circle cx="12" cy="12" r="5.2" fill="none" stroke={C.cyan} strokeWidth="1.5" opacity="0.75" />
              <path d="M12 12 L19 5.5" stroke={C.cyanDeep} strokeWidth="2.1" strokeLinecap="round" />
              <circle cx="12" cy="12" r="1.8" fill={C.cyanDeep} /><circle cx="16.6" cy="15.4" r="1.7" fill={C.amber} />
            </svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17.5, fontWeight: 850, letterSpacing: '-0.02em' }}>{t.app}</div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: C.sub, marginTop: 1 }}>{t.tag}</div>
          </div>
          {streak > 0 && (
            <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, background: C.amberSoft, color: C.amberDeep, borderRadius: 99, padding: '7px 12px', fontSize: 12, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={C.amber}><path d="M12 2c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-1.5-.4-2.3C18.6 8 20 10.6 20 13.5A8 8 0 1 1 6.6 8C7 10 8 11 9 11c-1-3 1-6 3-9Z" /></svg>
              {streak}
            </span>
          )}
        </header>

        {/* ══ TAB: 온도 ══ */}
        {tab === 'home' && (
          <>
            <section style={{ marginTop: 14, background: C.card, borderRadius: 26, padding: '17px 16px 13px', boxShadow: C.shadow, position: 'relative', overflow: 'hidden' }}>
              <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(75% 55% at 50% 0%, rgba(15,181,203,0.07), transparent 62%)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                <h1 style={{ margin: 0, fontSize: 15.5, fontWeight: 850 }}>{t.tempTitle}</h1>
                <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, letterSpacing: '0.05em', color: C.mint, background: C.mintSoft, borderRadius: 99, padding: '3px 9px' }}>● {t.live}</span>
              </div>
              {loaded ? (
                <>
                  <div style={{ marginTop: 4, position: 'relative' }}><Gauge score={temp.score} band={band} /></div>
                  {caption && <div style={{ margin: '2px 4px 12px', textAlign: 'center', fontSize: 12, lineHeight: 1.6, fontWeight: 700, color: C.sub }}>{caption}</div>}
                  <div style={{ display: 'flex', gap: 7, position: 'relative' }}>
                    {[
                      { k: t.compPcr, v: temp.pcr != null ? temp.pcr.toFixed(2) : '—', c: C.violet, bg: C.violetSoft },
                      { k: t.compGex, v: temp.gexPos == null ? '—' : temp.gexPos ? t.gexPos : t.gexNeg, c: C.cyanDeep, bg: C.cyanSoft },
                      { k: t.compDp, v: temp.dp != null ? `${Math.round(temp.dp)}%` : '—', c: C.navy, bg: C.navySoft },
                      { k: t.compSv, v: temp.sv != null ? `${Math.round(temp.sv)}%` : '—', c: C.coral, bg: C.coralSoft },
                    ].map((x) => (
                      <div key={x.k} style={{ flex: 1, minWidth: 0, background: x.bg, borderRadius: 14, padding: '9px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.04em', color: x.c, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.k.toUpperCase()}</div>
                        <div style={{ marginTop: 2, fontSize: 13, fontWeight: 900, color: x.c, whiteSpace: 'nowrap' }}>{x.v}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, fontSize: 12, fontWeight: 700 }}>{t.loading}</div>
              )}
            </section>

            <section style={{ marginTop: 16 }}>
              {sectionHead(t.sigTitle, t.sigSub)}
              {loaded && signals.length === 0 && (
                <div style={{ marginTop: 9, background: 'rgba(255,255,255,0.6)', border: `1.5px dashed ${C.line}`, borderRadius: 18, padding: '13px 14px', fontSize: 11.5, fontWeight: 700, color: C.sub, textAlign: 'center' }}>{t.sigNone}</div>
              )}
              {signals.map(({ tk, hit }) => (
                <button key={tk} type="button" onClick={() => setDetail(tk)} style={{ font: 'inherit', width: '100%', textAlign: 'left', cursor: 'pointer', marginTop: 9, display: 'flex', alignItems: 'center', gap: 11, background: 'linear-gradient(120deg, #FFF6E0 0%, #FFEDC2 100%)', border: 'none', borderRadius: 18, padding: '13px 14px', boxShadow: '0 10px 24px rgba(245,158,11,0.16)' }}>
                  <TickerLogo ticker={tk} size={34} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 900, color: C.ink }}>{tk}</span>
                    <span style={{ display: 'block', marginTop: 1, fontSize: 11, fontWeight: 800, color: C.amberDeep }}>{t.toLevel.replace('{l}', levelName[(hit as LevelHit).key])} {fmtD((hit as LevelHit).distPct)}</span>
                  </span>
                  <span aria-hidden style={{ width: 9, height: 9, borderRadius: 99, background: C.amber, boxShadow: '0 0 9px rgba(245,158,11,0.8)' }} />
                  <span style={{ color: C.amberDeep, fontWeight: 900 }}>›</span>
                </button>
              ))}
            </section>
          </>
        )}

        {/* ══ TAB: 레이더 ══ */}
        {tab === 'radar' && (
          <section style={{ marginTop: 16 }}>
            {sectionHead(t.radarTitle, t.radarSub)}
            <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
              {([['all', t.fAll], ['touch', t.fTouch], ['near', t.fNear]] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setFilter(k)} style={{ font: 'inherit', cursor: 'pointer', border: 'none', borderRadius: 99, padding: '7px 15px', fontSize: 11.5, fontWeight: 850, background: filter === k ? C.ink : C.card, color: filter === k ? '#fff' : C.sub, boxShadow: filter === k ? '0 6px 16px rgba(22,40,58,0.22)' : C.shadow }}>{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 11 }}>
              {wl.length === 0 && <div style={{ padding: '26px 0', textAlign: 'center', color: C.faint, fontSize: 12, fontWeight: 700 }}>{t.wlEmpty}</div>}
              {shown.map(({ tk, lab, hit }) => {
                const chip = chipFor(hit ? hit.distPct : null);
                const barPct = hit ? Math.max(0.07, 1 - Math.min(1, Math.abs(hit.distPct) / 5)) : 0.07;
                const sparkColor = hit && Math.abs(hit.distPct) <= 0.5 ? C.amber : hit && Math.abs(hit.distPct) <= 1.5 ? C.cyan : C.faint;
                return (
                  <button key={tk} type="button" onClick={() => setDetail(tk)} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', background: C.card, border: 'none', borderRadius: 20, padding: '13px 14px', boxShadow: C.shadow }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <TickerLogo ticker={tk} size={34} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 900, letterSpacing: '0.01em' }}>{tk}</span>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 750, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>{lab?.price != null ? `$${lab.price.toFixed(2)}` : '…'}</span>
                      </span>
                      <span style={{ marginLeft: 'auto' }}>{lab?.spark && lab.spark.closes.length >= 8 && <MiniSpark closes={lab.spark.closes} color={sparkColor} />}</span>
                      <span style={{ fontSize: 9, fontWeight: 900, color: chip.color, background: chip.bg, borderRadius: 99, padding: '4px 10px', flexShrink: 0 }}>{chip.label}</span>
                    </div>
                    {hit && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 10.5, fontWeight: 750, color: C.sub }}>
                          <span style={{ color: C.faint, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.05em' }}>{t.nearest.toUpperCase()}</span>
                          <span style={{ color: C.ink, fontWeight: 850 }}>{levelName[hit.key]} ${hit.value}</span>
                          <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: Math.abs(hit.distPct) <= 0.5 ? C.amberDeep : C.cyanDeep, fontWeight: 900 }}>{fmtD(hit.distPct)}</span>
                        </div>
                        <div style={{ marginTop: 6, height: 6, background: 'rgba(22,40,58,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ width: `${barPct * 100}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${C.cyan}, ${Math.abs(hit.distPct) <= 0.5 ? C.amber : C.cyanDeep})` }} />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input value={input} onChange={(e) => { setInput(e.target.value.toUpperCase()); setWlMsg(''); }} onKeyDown={(e) => { if (e.key === 'Enter') void addTicker(); }} placeholder={t.wlPh}
                style={{ font: 'inherit', flex: 1, minWidth: 0, background: C.card, color: C.ink, border: 'none', boxShadow: C.shadow, borderRadius: 15, padding: '12px 14px', fontSize: 13, fontWeight: 800, outline: 'none', letterSpacing: '0.03em' }} />
              <button type="button" onClick={() => void addTicker()} style={{ font: 'inherit', flexShrink: 0, background: `linear-gradient(135deg, ${C.cyan}, ${C.cyanDeep})`, color: '#fff', border: 'none', borderRadius: 15, padding: '0 19px', fontSize: 13, fontWeight: 900, cursor: 'pointer', boxShadow: '0 8px 20px rgba(15,181,203,0.35)' }}>{t.wlAdd}</button>
            </div>
            {wlMsg && <div style={{ marginTop: 6, fontSize: 10.5, fontWeight: 750, color: C.amberDeep }}>{wlMsg}</div>}
          </section>
        )}

        {/* ══ TAB: 탐색 (시장 랭킹) ══ */}
        {tab === 'discover' && (
          <section style={{ marginTop: 16 }}>
            {sectionHead(t.discTitle, t.discSub)}
            {rankCard(t.rankLevel, t.rankLevelSub, rankLevel.map((x) => x.l), C.amber, (l) => { const h = nearestLevel(l); return h ? fmtD(h.distPct) : ''; })}
            {rankCard(t.rankDark, t.rankDarkSub, rankDark, C.violet, (l) => l.darkPoolPct != null ? `${Math.round(l.darkPoolPct)}%` : '')}
            {rankCard(t.rankSqueeze, t.rankSqueezeSub, rankSqueeze, C.coral, (l) => l.squeeze?.riskScore != null ? String(Math.round(l.squeeze.riskScore)) : '')}
          </section>
        )}

        {/* ══ TAB: 나 ══ */}
        {tab === 'me' && (
          <section style={{ marginTop: 16 }}>
            {sectionHead(t.meTitle, '')}
            <div style={{ marginTop: 11, background: 'linear-gradient(135deg, #FFF6E0, #FFEACB)', borderRadius: 22, padding: '18px 18px', boxShadow: '0 12px 28px rgba(245,158,11,0.16)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 58, height: 58, borderRadius: 18, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(245,158,11,0.2)' }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill={C.amber}><path d="M12 2c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-1.5-.4-2.3C18.6 8 20 10.6 20 13.5A8 8 0 1 1 6.6 8C7 10 8 11 9 11c-1-3 1-6 3-9Z" /></svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 900, color: C.amberDeep, letterSpacing: '0.02em' }}>{t.checkinTitle}</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{streak}<span style={{ fontSize: 15, marginLeft: 4 }}>{t.days}</span></div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: C.amberDeep, opacity: 0.85 }}>{t.checkinSub}</div>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>{sectionHead(t.manageTitle, `${wl.length}/10`)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {wl.map((tk) => (
                <span key={tk} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.card, borderRadius: 99, padding: '7px 8px 7px 8px', boxShadow: C.shadow }}>
                  <TickerLogo ticker={tk} size={22} />
                  <span style={{ fontSize: 12.5, fontWeight: 900 }}>{tk}</span>
                  <button type="button" aria-label={t.del} onClick={() => rmTicker(tk)} style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: C.faint, fontSize: 15, lineHeight: 1, padding: '0 4px' }}>×</button>
                </span>
              ))}
            </div>

            <button type="button" onClick={() => setLangOpen(true)} style={{ font: 'inherit', width: '100%', textAlign: 'left', cursor: 'pointer', marginTop: 18, background: C.card, border: 'none', borderRadius: 16, padding: '15px 16px', boxShadow: C.shadow, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 850 }}>{t.langTitle}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 850, color: C.cyanDeep }}>{loc === 'en' ? 'English' : loc === 'ja' ? '日本語' : '한국어'} ›</span>
            </button>
          </section>
        )}

        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 9.5, color: C.faint, fontWeight: 650, lineHeight: 1.6 }}>
          {t.disc}<br />{t.app} · {t.proto} · {t.by}
        </div>
      </div>

      {/* ══ bottom nav ══ */}
      <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', justifyContent: 'center', pointerEvents: 'none', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div style={{ pointerEvents: 'auto', display: 'flex', gap: 4, margin: '0 12px 12px', padding: 6, background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', border: `1px solid ${C.line}`, borderRadius: 22, boxShadow: '0 12px 34px rgba(22,40,58,0.16)', width: 'min(520px, calc(100% - 24px))' }}>
          {(['home', 'radar', 'discover', 'me'] as Tab[]).map((k) => {
            const active = tab === k;
            const label = k === 'home' ? t.tabHome : k === 'radar' ? t.tabRadar : k === 'discover' ? t.tabDiscover : t.tabMe;
            return (
              <button key={k} type="button" aria-label={label} onClick={() => { setTab(k); window.scrollTo(0, 0); }} style={{ font: 'inherit', flex: 1, border: 'none', cursor: 'pointer', borderRadius: 16, padding: '9px 0 7px', background: active ? `linear-gradient(150deg, ${C.cyan}, ${C.cyanDeep})` : 'transparent', color: active ? '#fff' : C.sub, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'background 0.2s ease' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? '#fff' : C.sub} strokeWidth={active ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round"><path d={NAV_ICON[k]} /></svg>
                <span style={{ fontSize: 9.5, fontWeight: 900 }}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* detail sheet */}
      {detail && dLab && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(22,40,58,0.42)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: '#FDFEFF', borderRadius: '24px 24px 0 0', padding: '18px 18px calc(22px + env(safe-area-inset-bottom))', boxShadow: '0 -18px 50px rgba(22,40,58,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <TickerLogo ticker={detail} size={36} />
              <span style={{ fontSize: 17, fontWeight: 900 }}>{detail}</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>{dLab.price != null ? `$${dLab.price.toFixed(2)}` : ''}</span>
              <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, color: C.mint, background: C.mintSoft, borderRadius: 99, padding: '3px 9px' }}>● {t.live}</span>
            </div>
            {dLab.spark && dLab.spark.closes.length >= 8 && (
              <div style={{ marginTop: 13, background: C.cyanSoft, borderRadius: 16, padding: '10px 12px 6px' }}>
                <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.06em', color: C.cyanDeep, marginBottom: 4 }}>{t.spark5.toUpperCase()}</div>
                <MiniSpark closes={dLab.spark.closes} w={300} h={58} color={C.cyanDeep} />
              </div>
            )}
            <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.06em', color: C.faint, margin: '14px 0 6px' }}>{t.ladder.toUpperCase()}</div>
            {(() => {
              const price = dLab.price;
              const items: { label: string; v: number | null; hi?: boolean }[] = [
                { label: t.callWall, v: dLab.levels.callWall },
                { label: t.last, v: price, hi: true },
                { label: t.gammaFlip, v: dLab.gex.gammaFlip },
                { label: t.maxPain, v: dLab.levels.maxPain },
                { label: t.putFloor, v: dLab.levels.putFloor },
              ].filter((x) => x.v != null).sort((a, b) => (b.v as number) - (a.v as number));
              return items.map((it) => (
                <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: it.hi ? C.cyanSoft : 'transparent' }}>
                  <span style={{ width: 96, fontSize: 11, fontWeight: 850, letterSpacing: '0.03em', color: it.hi ? C.cyanDeep : C.sub }}>{it.label.toUpperCase()}</span>
                  <span style={{ flex: 1, borderTop: `1.5px ${it.hi ? 'solid' : 'dashed'} ${it.hi ? C.cyan : 'rgba(22,40,58,0.12)'}` }} />
                  <span style={{ width: 62, textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{!it.hi && price != null ? fmtD((((it.v as number) - price) / price) * 100) : ''}</span>
                  <span style={{ width: 80, textAlign: 'right', fontSize: it.hi ? 17 : 13.5, fontWeight: 900, color: it.hi ? C.cyanDeep : C.ink, fontVariantNumeric: 'tabular-nums' }}>${it.v}</span>
                </div>
              ));
            })()}
            <div style={{ display: 'flex', gap: 9, marginTop: 15 }}>
              {wl.includes(detail)
                ? <button type="button" onClick={() => { rmTicker(detail); setDetail(null); }} style={{ font: 'inherit', flex: 1, background: C.coralSoft, color: C.coral, border: 'none', borderRadius: 15, padding: '13px 0', fontSize: 12.5, fontWeight: 850, cursor: 'pointer' }}>{t.del}</button>
                : <button type="button" onClick={() => { void addTicker(detail); setDetail(null); setTab('radar'); }} style={{ font: 'inherit', flex: 1, background: C.mintSoft, color: C.mint, border: 'none', borderRadius: 15, padding: '13px 0', fontSize: 12.5, fontWeight: 850, cursor: 'pointer' }}>{t.addToWl}</button>}
              <button type="button" onClick={() => setDetail(null)} style={{ font: 'inherit', flex: 2, background: `linear-gradient(135deg, ${C.cyan}, ${C.cyanDeep})`, color: '#fff', border: 'none', borderRadius: 15, padding: '13px 0', fontSize: 12.5, fontWeight: 900, cursor: 'pointer' }}>{t.close}</button>
            </div>
          </div>
        </div>
      )}

      {/* language sheet */}
      {langOpen && (
        <div onClick={() => setLangOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(22,40,58,0.42)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: '#FDFEFF', borderRadius: '24px 24px 0 0', padding: '18px 18px calc(22px + env(safe-area-inset-bottom))' }}>
            <div style={{ fontSize: 14.5, fontWeight: 900, marginBottom: 12 }}>{t.lang}</div>
            {(['en', 'ja', 'ko'] as Lang[]).map((l) => (
              <a key={l} href={`/${l}/radar`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 12px', borderRadius: 13, background: l === loc ? C.cyanSoft : 'transparent', color: l === loc ? C.cyanDeep : C.ink, textDecoration: 'none', fontSize: 13.5, fontWeight: 850 }}>
                {l === 'en' ? 'English' : l === 'ja' ? '日本語' : '한국어'}{l === loc && <span style={{ marginLeft: 'auto' }}>✓</span>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
