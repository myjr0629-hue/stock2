'use client';

// ============================================================================
// 기관 레이더 (Level Radar) — 4th spinoff PROTOTYPE (2026-07-20)
// Thesis (SPINOFF4_RESEARCH.md): the unoccupied tier is "institutional data ×
// free-with-ads × push utility". This prototype proves the two daily loops on
// REAL data reusing /api/wim/lab (15-min SWR institutional snapshot):
//   1) 시장 온도 — one-glance proprietary gauge (PCR/GEX/short-vol composite)
//   2) 레벨 레이더 — how close each watchlist ticker sits to dealer levels
//      (call wall / max pain / gamma flip / put floor), nearest-level ranked
// Push alerts arrive with the native shell; the web prototype surfaces the
// same events as "오늘의 시그널". Compliance: observer language only, no
// prediction, no buy/sell. Identity: obsidian + radar cyan (distinct from
// SIGNUM dark/gold, UC cream, WIM violet).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type Lang = 'ko' | 'en' | 'ja';

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
    tempTitle: '오늘 시장 온도', tempSub: '고래·옵션 구조 합성 관찰 지수 — 예측이 아닌 현재 상태',
    live: '실데이터', loading: '기관 데이터 수신 중…',
    b0: '냉각', b1: '서늘', b2: '중립', b3: '온기', b4: '과열',
    compPcr: '풋/콜', compGex: '감마 레짐', compDp: '다크풀', compSv: '숏볼륨',
    gexPos: '억제(+)', gexNeg: '증폭(−)',
    radarTitle: '레벨 레이더', radarSub: '내 종목이 기관 레벨에 얼마나 가까운가',
    near: '근접', touch: '터치권', watch: '관망',
    nearest: '최근접 레벨', dist: '거리',
    callWall: '콜월', maxPain: '맥스페인', gammaFlip: '감마플립', putFloor: '풋플로어', last: '현재가',
    sigTitle: '오늘의 시그널', sigSub: '레벨 0.5% 이내 — 셸 버전에선 푸시로 도착',
    sigNone: '지금 레벨권에 든 종목이 없어요 — 조용한 장',
    sigLine: '{t} · {l}까지 {d}',
    wlTitle: '워치리스트', wlAdd: '추가', wlPh: '티커 (예: NVDA)', wlDup: '이미 있어요', wlBad: '데이터를 찾지 못했어요', wlMax: '프로토타입은 10개까지',
    del: '삭제', close: '닫기',
    ladder: '레벨 사다리', spark5: '오늘 실제 세션',
    disc: '교육용 시장 정보입니다. 투자 조언이 아니며 정확성을 보장하지 않습니다.',
    proto: '프로토타입', by: 'by SIGNUM HQ',
    lang: '언어',
  },
  en: {
    app: 'Level Radar', tag: 'Market temp · dealer levels · 3-sec check',
    tempTitle: "Today's market temperature", tempSub: 'Composite observation of whale/options structure — a reading, not a forecast',
    live: 'LIVE DATA', loading: 'Receiving institutional data…',
    b0: 'Cold', b1: 'Cool', b2: 'Neutral', b3: 'Warm', b4: 'Hot',
    compPcr: 'Put/Call', compGex: 'Gamma regime', compDp: 'Dark pool', compSv: 'Short vol',
    gexPos: 'Damped (+)', gexNeg: 'Amplified (−)',
    radarTitle: 'Level radar', radarSub: 'How close your tickers sit to dealer levels',
    near: 'Near', touch: 'At level', watch: 'Quiet',
    nearest: 'Nearest level', dist: 'distance',
    callWall: 'Call wall', maxPain: 'Max pain', gammaFlip: 'Gamma flip', putFloor: 'Put floor', last: 'Last',
    sigTitle: "Today's signals", sigSub: 'Within 0.5% of a level — arrives as push in the app',
    sigNone: 'Nothing in level range right now — a quiet tape',
    sigLine: '{t} · {d} to {l}',
    wlTitle: 'Watchlist', wlAdd: 'Add', wlPh: 'Ticker (e.g. NVDA)', wlDup: 'Already added', wlBad: 'No data found', wlMax: 'Prototype caps at 10',
    del: 'Remove', close: 'Close',
    ladder: 'Level ladder', spark5: "Today's real session",
    disc: 'Educational market information only. Not investment advice; accuracy not guaranteed.',
    proto: 'prototype', by: 'by SIGNUM HQ',
    lang: 'Language',
  },
  ja: {
    app: 'レベルレーダー', tag: '市場温度 · ディーラーレベル · 3秒チェック',
    tempTitle: '今日の市場温度', tempSub: 'クジラ・オプション構造の合成観察指数 — 予測ではなく現在の状態',
    live: 'ライブ', loading: '機関データ受信中…',
    b0: '冷却', b1: '涼しい', b2: '中立', b3: '温かい', b4: '過熱',
    compPcr: 'プット/コール', compGex: 'ガンマ状態', compDp: 'ダークプール', compSv: '空売り出来高',
    gexPos: '抑制(+)', gexNeg: '増幅(−)',
    radarTitle: 'レベルレーダー', radarSub: '保有銘柄が機関レベルにどれだけ近いか',
    near: '接近', touch: 'レベル圏', watch: '静観',
    nearest: '最寄りレベル', dist: '距離',
    callWall: 'コールウォール', maxPain: 'マックスペイン', gammaFlip: 'ガンマフリップ', putFloor: 'プットフロア', last: '現在値',
    sigTitle: '今日のシグナル', sigSub: 'レベルまで0.5%以内 — アプリ版ではプッシュ通知',
    sigNone: '現在レベル圏の銘柄なし — 静かな相場',
    sigLine: '{t} · {l}まで{d}',
    wlTitle: 'ウォッチリスト', wlAdd: '追加', wlPh: 'ティッカー (例: NVDA)', wlDup: '追加済み', wlBad: 'データ未検出', wlMax: '試作版は10件まで',
    del: '削除', close: '閉じる',
    ladder: 'レベルラダー', spark5: '本日の実セッション',
    disc: '教育目的の市場情報です。投資助言ではなく、正確性は保証されません。',
    proto: 'プロトタイプ', by: 'by SIGNUM HQ',
    lang: '言語',
  },
};

// ── palette: obsidian × radar cyan (2026-07-20 identity) ──
const C = {
  bg: '#0A0E16', card: '#111726', card2: '#0E1420', line: 'rgba(148,163,196,0.14)',
  ink: '#E9EEF8', sub: '#9AA6BD', faint: '#5B677E',
  cyan: '#2FD6E8', cyanDeep: '#0FB5CB', cyanSoft: 'rgba(47,214,232,0.12)',
  amber: '#FFB224', amberSoft: 'rgba(255,178,36,0.13)',
  mint: '#2DD4A8', mintSoft: 'rgba(45,212,168,0.12)',
  red: '#FF6B6B',
};

const DEFAULT_WL = ['NVDA', 'TSLA', 'AAPL', 'SPY', 'QQQ', 'META'];
const MARKET_REF = ['SPY', 'QQQ']; // temperature inputs (index proxies)

const fmtD = (p: number) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%`;

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

// 온도(0-100): 관찰 합성 — PCR(공포↑=차가움), 넷감마(음수=증폭=차가움), 숏볼륨(높음=차가움).
// 밴드/기여를 화면에 그대로 공개(블랙박스 금지). clamp 5..95.
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

function MiniSpark({ closes, w = 132, h = 36, color = C.cyan }: { closes: number[]; w?: number; h?: number; color?: string }) {
  if (closes.length < 2) return null;
  const min = Math.min(...closes), max = Math.max(...closes), span = max - min || 1;
  const pts = closes.map((v, i) => `${(i / (closes.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// 반원 게이지 — 그라디언트 아크 + 니들. 프리미엄 히어로.
function Gauge({ score, band }: { score: number; band: string }) {
  const a = (-90 + (score / 100) * 180) * (Math.PI / 180);
  const R = 118, cx = 150, cy = 150;
  const nx = cx + Math.sin(a) * (R - 26), ny = cy - Math.cos(a) * (R - 26);
  return (
    <svg width="300" height="172" viewBox="0 0 300 172" style={{ display: 'block', margin: '0 auto' }}>
      <defs>
        <linearGradient id="rg" x1="0" y1="1" x2="1" y2="1">
          <stop offset="0" stopColor="#3E6BFF" />
          <stop offset="0.45" stopColor={C.cyan} />
          <stop offset="0.75" stopColor={C.amber} />
          <stop offset="1" stopColor={C.red} />
        </linearGradient>
      </defs>
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="rgba(148,163,196,0.16)" strokeWidth="14" strokeLinecap="round" />
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="url(#rg)" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * Math.PI * R} ${Math.PI * R}`} />
      {[0, 25, 50, 75, 100].map((tk) => {
        const ta = (-90 + (tk / 100) * 180) * (Math.PI / 180);
        const x1 = cx + Math.sin(ta) * (R + 12), y1 = cy - Math.cos(ta) * (R + 12);
        const x2 = cx + Math.sin(ta) * (R + 18), y2 = cy - Math.cos(ta) * (R + 18);
        return <line key={tk} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.faint} strokeWidth="2" strokeLinecap="round" />;
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={C.ink} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="7" fill={C.ink} />
      <text x={cx} y={cy - 34} textAnchor="middle" fill={C.ink} fontSize="44" fontWeight="800" fontFamily="inherit">{score}</text>
      <text x={cx} y={cy - 12} textAnchor="middle" fill={C.cyan} fontSize="15" fontWeight="800" fontFamily="inherit" letterSpacing="2">{band}</text>
    </svg>
  );
}

export default function RadarPage() {
  const params = useParams<{ locale: string }>();
  const loc: Lang = params?.locale === 'en' ? 'en' : params?.locale === 'ja' ? 'ja' : 'ko';
  const t = T[loc];

  const [wl, setWl] = useState<string[]>(DEFAULT_WL);
  const [labs, setLabs] = useState<Record<string, Lab>>({});
  const [loaded, setLoaded] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [wlMsg, setWlMsg] = useState('');
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('radar.wl') || 'null');
      if (Array.isArray(saved) && saved.length) setWl(saved.slice(0, 10));
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

  useEffect(() => {
    let alive = true;
    const want = Array.from(new Set([...wl, ...MARKET_REF]));
    Promise.all(want.map(async (tk) => [tk, await fetchLab(tk)] as const)).then((pairs) => {
      if (!alive) return;
      const next: Record<string, Lab> = {};
      pairs.forEach(([tk, lb]) => { if (lb) next[tk] = lb; });
      setLabs(next); setLoaded(true);
    });
    return () => { alive = false; };
  }, [wl, fetchLab]);

  const temp = useMemo(() => temperature(MARKET_REF.map((tk) => labs[tk]).filter(Boolean) as Lab[]), [labs]);
  const band = temp.score < 30 ? t.b0 : temp.score < 45 ? t.b1 : temp.score < 58 ? t.b2 : temp.score < 75 ? t.b3 : t.b4;

  const rows = useMemo(() => wl
    .map((tk) => ({ tk, lab: labs[tk] as Lab | undefined }))
    .map(({ tk, lab }) => ({ tk, lab, hit: lab ? nearestLevel(lab) : null }))
    .sort((a, b) => (a.hit ? Math.abs(a.hit.distPct) : 99) - (b.hit ? Math.abs(b.hit.distPct) : 99)), [wl, labs]);

  const signals = rows.filter((r) => r.hit && Math.abs(r.hit.distPct) <= 0.5);

  const addTicker = async () => {
    const tk = input.trim().toUpperCase();
    if (!/^[A-Z]{1,6}$/.test(tk)) return;
    if (wl.includes(tk)) { setWlMsg(t.wlDup); return; }
    if (wl.length >= 10) { setWlMsg(t.wlMax); return; }
    setWlMsg('…');
    const lb = await fetchLab(tk);
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
  const chipFor = (d: number) => Math.abs(d) <= 0.5
    ? { label: t.touch, color: C.amber, bg: C.amberSoft }
    : Math.abs(d) <= 1.5
      ? { label: t.near, color: C.cyan, bg: C.cyanSoft }
      : { label: t.watch, color: C.faint, bg: 'rgba(148,163,196,0.10)' };

  const dLab = detail ? labs[detail] : null;

  return (
    <div style={{ minHeight: '100vh', background: `radial-gradient(120% 60% at 50% -8%, rgba(47,214,232,0.10), transparent 60%), ${C.bg}`, color: C.ink, fontFamily: "-apple-system,'SF Pro','Inter','Pretendard',sans-serif" }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 16px calc(44px + env(safe-area-inset-bottom))' }}>

        {/* ── masthead: 동심원 레이더 마크 + 앱명 ── */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'calc(14px + env(safe-area-inset-top))' }}>
          <span aria-hidden style={{ width: 40, height: 40, borderRadius: 13, background: 'linear-gradient(150deg,#12202E,#0B1622)', border: `1px solid ${C.line}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" fill="none" stroke={C.cyan} strokeWidth="1.4" opacity="0.5" />
              <circle cx="12" cy="12" r="5.2" fill="none" stroke={C.cyan} strokeWidth="1.4" opacity="0.8" />
              <path d="M12 12 L19 5.5" stroke={C.cyan} strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="1.8" fill={C.cyan} />
              <circle cx="16.6" cy="15.4" r="1.6" fill={C.amber} />
            </svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 850, letterSpacing: '-0.01em' }}>{t.app}</div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: C.sub, marginTop: 1 }}>{t.tag}</div>
          </div>
          <button type="button" aria-label={t.lang} onClick={() => setLangOpen(true)} style={{ font: 'inherit', marginLeft: 'auto', flexShrink: 0, background: C.card, color: C.sub, border: `1px solid ${C.line}`, borderRadius: 12, padding: '8px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
            {loc.toUpperCase()}
          </button>
        </header>

        {/* ── HERO: 시장 온도 ── */}
        <section style={{ marginTop: 14, background: `linear-gradient(165deg, ${C.card} 0%, ${C.card2} 100%)`, border: `1px solid ${C.line}`, borderRadius: 24, padding: '18px 16px 8px', boxShadow: '0 24px 50px rgba(0,0,0,0.45)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 15.5, fontWeight: 850 }}>{t.tempTitle}</h1>
            <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, letterSpacing: '0.06em', color: C.mint, background: C.mintSoft, borderRadius: 99, padding: '3px 9px' }}>● {t.live}</span>
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 650, color: C.sub, marginTop: 3, lineHeight: 1.5 }}>{t.tempSub}</div>
          {loaded ? (
            <>
              <div style={{ marginTop: 6 }}><Gauge score={temp.score} band={band} /></div>
              <div style={{ display: 'flex', gap: 8, margin: '2px 0 14px' }}>
                {[
                  { k: t.compPcr, v: temp.pcr != null ? temp.pcr.toFixed(2) : '—' },
                  { k: t.compGex, v: temp.gexPos == null ? '—' : temp.gexPos ? t.gexPos : t.gexNeg },
                  { k: t.compDp, v: temp.dp != null ? `${Math.round(temp.dp)}%` : '—' },
                  { k: t.compSv, v: temp.sv != null ? `${Math.round(temp.sv)}%` : '—' },
                ].map((c) => (
                  <div key={c.k} style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.line}`, borderRadius: 13, padding: '8px 4px', textAlign: 'center' }}>
                    <div style={{ fontSize: 7.5, fontWeight: 850, letterSpacing: '0.05em', color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.k.toUpperCase()}</div>
                    <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 850, color: C.ink, whiteSpace: 'nowrap' }}>{c.v}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, fontSize: 12, fontWeight: 700 }}>{t.loading}</div>
          )}
        </section>

        {/* ── 오늘의 시그널 ── */}
        <section style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px' }}>
            <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 850 }}>{t.sigTitle}</h2>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: C.faint }}>{t.sigSub}</span>
          </div>
          {loaded && signals.length === 0 && (
            <div style={{ marginTop: 9, background: C.card2, border: `1px dashed ${C.line}`, borderRadius: 16, padding: '13px 14px', fontSize: 11.5, fontWeight: 700, color: C.sub, textAlign: 'center' }}>{t.sigNone}</div>
          )}
          {signals.map(({ tk, hit }) => (
            <button key={tk} type="button" onClick={() => setDetail(tk)} style={{ font: 'inherit', width: '100%', textAlign: 'left', cursor: 'pointer', marginTop: 9, display: 'flex', alignItems: 'center', gap: 10, background: C.amberSoft, border: `1px solid rgba(255,178,36,0.35)`, borderRadius: 16, padding: '12px 14px' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: C.amber, boxShadow: `0 0 10px ${C.amber}` }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 850, color: C.ink }}>
                {t.sigLine.replace('{t}', tk).replace('{l}', levelName[(hit as LevelHit).key]).replace('{d}', fmtD((hit as LevelHit).distPct))}
              </span>
              <span style={{ color: C.amber, fontWeight: 900 }}>›</span>
            </button>
          ))}
        </section>

        {/* ── 레벨 레이더 (워치리스트) ── */}
        <section style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px' }}>
            <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 850 }}>{t.radarTitle}</h2>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, color: C.faint }}>{t.radarSub}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {rows.map(({ tk, lab, hit }) => {
              const chip = hit ? chipFor(hit.distPct) : { label: t.watch, color: C.faint, bg: 'rgba(148,163,196,0.10)' };
              const gaugePct = hit ? Math.max(0.06, 1 - Math.min(1, Math.abs(hit.distPct) / 5)) : 0.06;
              return (
                <button key={tk} type="button" onClick={() => setDetail(tk)} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: '13px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 900, letterSpacing: '0.02em' }}>{tk}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>{lab?.price != null ? `$${lab.price.toFixed(2)}` : '…'}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: chip.color, background: chip.bg, borderRadius: 99, padding: '3px 10px' }}>{chip.label}</span>
                  </div>
                  {hit && (
                    <div style={{ marginTop: 9 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 10.5, fontWeight: 750, color: C.sub }}>
                        <span style={{ color: C.faint, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.05em' }}>{t.nearest.toUpperCase()}</span>
                        <span style={{ color: C.ink, fontWeight: 850 }}>{levelName[hit.key]} ${hit.value}</span>
                        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: Math.abs(hit.distPct) <= 0.5 ? C.amber : C.cyan, fontWeight: 900 }}>{fmtD(hit.distPct)}</span>
                      </div>
                      <div style={{ marginTop: 6, height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ width: `${gaugePct * 100}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${C.cyanDeep}, ${Math.abs(hit.distPct) <= 0.5 ? C.amber : C.cyan})` }} />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* add / manage */}
          <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
            <input
              value={input}
              onChange={(e) => { setInput(e.target.value.toUpperCase()); setWlMsg(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void addTicker(); }}
              placeholder={t.wlPh}
              style={{ font: 'inherit', flex: 1, minWidth: 0, background: C.card2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 14, padding: '11px 13px', fontSize: 13, fontWeight: 800, outline: 'none', letterSpacing: '0.04em' }}
            />
            <button type="button" onClick={() => void addTicker()} style={{ font: 'inherit', flexShrink: 0, background: C.cyan, color: '#04252B', border: 'none', borderRadius: 14, padding: '0 18px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }}>{t.wlAdd}</button>
          </div>
          {wlMsg && <div style={{ marginTop: 6, fontSize: 10.5, fontWeight: 750, color: C.amber }}>{wlMsg}</div>}
        </section>

        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 9.5, color: C.faint, fontWeight: 650, lineHeight: 1.6 }}>
          {t.disc}<br />{t.app} · {t.proto} · {t.by}
        </div>
      </div>

      {/* ── detail sheet: 레벨 사다리 + 실세션 스파크 ── */}
      {detail && dLab && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(4,8,14,0.72)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: C.card, borderTop: `1px solid ${C.line}`, borderRadius: '22px 22px 0 0', padding: '18px 18px calc(22px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 17, fontWeight: 900 }}>{detail}</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>{dLab.price != null ? `$${dLab.price.toFixed(2)}` : ''}</span>
              <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, color: C.mint, background: C.mintSoft, borderRadius: 99, padding: '3px 9px' }}>● {t.live}</span>
            </div>
            {dLab.spark && dLab.spark.closes.length >= 8 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.06em', color: C.faint, marginBottom: 5 }}>{t.spark5.toUpperCase()}</div>
                <MiniSpark closes={dLab.spark.closes} w={320} h={64} />
              </div>
            )}
            <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.06em', color: C.faint, margin: '14px 0 7px' }}>{t.ladder.toUpperCase()}</div>
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
                <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 11, background: it.hi ? C.cyanSoft : 'transparent' }}>
                  <span style={{ width: 96, fontSize: 11, fontWeight: 850, letterSpacing: '0.04em', color: it.hi ? C.cyan : C.sub }}>{it.label.toUpperCase()}</span>
                  <span style={{ flex: 1, borderTop: `1px ${it.hi ? 'solid' : 'dashed'} ${it.hi ? C.cyan : C.line}` }} />
                  <span style={{ width: 66, textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>
                    {!it.hi && price != null ? fmtD((((it.v as number) - price) / price) * 100) : ''}
                  </span>
                  <span style={{ width: 78, textAlign: 'right', fontSize: it.hi ? 17 : 13.5, fontWeight: 900, color: it.hi ? C.cyan : C.ink, fontVariantNumeric: 'tabular-nums' }}>${it.v}</span>
                </div>
              ));
            })()}
            <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
              <button type="button" onClick={() => { rmTicker(detail); setDetail(null); }} style={{ font: 'inherit', flex: 1, background: 'transparent', color: C.red, border: `1px solid rgba(255,107,107,0.4)`, borderRadius: 14, padding: '12px 0', fontSize: 12.5, fontWeight: 850, cursor: 'pointer' }}>{t.del}</button>
              <button type="button" onClick={() => setDetail(null)} style={{ font: 'inherit', flex: 2, background: C.cyan, color: '#04252B', border: 'none', borderRadius: 14, padding: '12px 0', fontSize: 12.5, fontWeight: 900, cursor: 'pointer' }}>{t.close}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── language sheet ── */}
      {langOpen && (
        <div onClick={() => setLangOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(4,8,14,0.72)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: C.card, borderRadius: '22px 22px 0 0', padding: '18px 18px calc(22px + env(safe-area-inset-bottom))' }}>
            <div style={{ fontSize: 14.5, fontWeight: 900, marginBottom: 12 }}>{t.lang}</div>
            {(['en', 'ja', 'ko'] as Lang[]).map((l) => (
              <a key={l} href={`/${l}/radar`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 12px', borderRadius: 13, background: l === loc ? C.cyanSoft : 'transparent', color: l === loc ? C.cyan : C.ink, textDecoration: 'none', fontSize: 13.5, fontWeight: 850 }}>
                {l === 'en' ? 'English' : l === 'ja' ? '日本語' : '한국어'}
                {l === loc && <span style={{ marginLeft: 'auto' }}>✓</span>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
