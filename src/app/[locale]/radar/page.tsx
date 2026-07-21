'use client';

// ============================================================================
// 기관 레이더 (Level Radar) — 4th spinoff PROTOTYPE · v4 "Rich home + dividends"
// (2026-07-21: richer first screen + a full 배당 tab on verified /api/dividends.)
// Tabs: 온도(rich home) · 레이더(watchlist levels) · 배당(yield/calendar/calculator/
//       ex-div sim) · 나(check-in streak + manage). Discover rankings folded into
// home as "시장 하이라이트". Spotify liveliness × Acorns light premium; real logos.
// Data: /api/wim/lab (15-min SWR institutional) + /api/dividends (6h SWR, derived
// yield verified live: SCHD 3.1% / JEPI 8.2% / QYLD 12%). Observer language only.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type Lang = 'ko' | 'en' | 'ja';
type Tab = 'home' | 'radar' | 'div' | 'me';

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
interface DivData {
  ticker: string; price: number | null; yieldPct: number | null; ttmYieldPct: number | null;
  freqLabel: string | null; cash: number | null; annualPerShare: number | null;
  nextExDate: string | null; nextExEstimated: boolean; lastExDate: string | null; payDate: string | null;
}

const T: Record<Lang, Record<string, string>> = {
  ko: {
    app: '기관 레이더', tag: '시장 온도 · 딜러 레벨 · 3초 체크',
    tabHome: '온도', tabRadar: '레이더', tabDiv: '배당', tabMe: '나',
    tempTitle: '오늘 시장 온도', live: '실데이터', loading: '기관 데이터 수신 중…',
    b0: '냉각', b1: '서늘', b2: '중립', b3: '온기', b4: '과열',
    cap0: '풋이 콜보다 많고({pcr}) 숏볼륨 {sv}% — 방어적인 자금 흐름이 관찰돼요',
    cap1: '옵션 수요가 조심스러운 쪽({pcr})으로 기울어 있어요',
    cap2: '풋·콜이 균형({pcr}) — 뚜렷한 쏠림 없는 상태예요',
    cap3: '콜 수요가 앞서고({pcr}) 변동 억제 구간 — 온기가 관찰돼요',
    cap4: '콜 쏠림({pcr})이 강해요 — 과열 신호들이 관찰돼요',
    compPcr: '풋/콜', compGex: '감마', compDp: '다크풀', compSv: '숏볼륨',
    gexPos: '억제 +', gexNeg: '증폭 −',
    breadthUp: '상승', breadthDown: '하락', breadthDp: '평균 다크풀',
    fAll: '전체', fTouch: '터치권', fNear: '근접',
    sigTitle: '오늘의 시그널', sigSub: '레벨 0.5% 이내 · 앱에선 푸시로',
    sigNone: '지금 레벨권에 든 종목이 없어요 — 조용한 장이에요',
    toLevel: '{l}까지', nearest: '최근접',
    callWall: '콜월', maxPain: '맥스페인', gammaFlip: '감마플립', putFloor: '풋플로어', last: '현재가',
    touch: '터치권', near: '근접', watch: '관망',
    radarTitle: '레벨 레이더', radarSub: '내 종목 ↔ 기관 레벨 거리',
    wlPh: '티커 추가 (예: NVDA)', wlAdd: '추가', wlDup: '이미 있어요', wlBad: '데이터를 찾지 못했어요', wlMax: '프로토타입은 10개까지', wlEmpty: '아래에서 종목을 추가해 보세요',
    del: '삭제', close: '닫기', ladder: '레벨 사다리', spark5: '오늘 실제 세션',
    hlTitle: '오늘의 시장 하이라이트', hlSub: '실데이터로 뽑은',
    hlDark: '다크풀 활발', hlSqueeze: '스퀴즈 압력', hlLevel: '레벨 근접', seeMore: '더 보기',
    divHomeTitle: '이번 주 배당락', divHomeSub: '워치리스트·인기 배당 종목', divHomeNone: '다가오는 배당락 일정이 없어요',
    dday: 'D-{n}', ddayToday: '오늘', exDate: '배당락', payDate: '지급', est: '예상',
    divTitle: '배당 정보', divSub: '수익률·달력·계산기 · 정보 제공용',
    rankYield: '배당수익률 랭킹', rankYieldSub: '최근 12개월 기준', perYear: '연 {n}회',
    fMonthly: '월배당', fQuarterly: '분기', fSemi: '반기', fAnnual: '연배당', fWeekly: '주배당', fOne: '일시', fOther: '반기·연',
    calcTitle: '인컴 계산기', calcSub: '얼마 넣으면 얼마 받을까 (정보용, 조언 아님)',
    calcPick: '종목', calcAmount: '투자 금액', calcYear: '예상 연 배당', calcMonth: '월 환산', calcYieldOn: '적용 수익률',
    calTitle: '배당락 캘린더', calSub: '다가오는 배당락일',
    simTitle: '배당락 이해하기', simSub: '배당락일엔 시가가 배당금만큼 낮게 시작하는 경향 — 교육용 시뮬',
    simBefore: '배당락 전', simAfter: '배당락일 시가(경향)', simCash: '배당금',
    simNote: '배당을 받을 권리가 사라지는 만큼, 이론상 시가가 그만큼 낮게 시작하는 경향이 관찰됩니다.',
    meTitle: '나의 레이더', checkinTitle: '연속 체크인', checkinSub: '매일 3초, 시장 온도 확인 습관', days: '일',
    manageTitle: '워치리스트 관리', langTitle: '언어',
    disc: '교육용 시장 정보입니다. 투자 조언이 아니며 정확성을 보장하지 않습니다.',
    proto: '프로토타입', by: 'by SIGNUM HQ', lang: '언어',
  },
  en: {
    app: 'Level Radar', tag: 'Market temp · dealer levels · 3-sec check',
    tabHome: 'Temp', tabRadar: 'Radar', tabDiv: 'Income', tabMe: 'Me',
    tempTitle: "Today's market temperature", live: 'LIVE', loading: 'Receiving institutional data…',
    b0: 'Cold', b1: 'Cool', b2: 'Neutral', b3: 'Warm', b4: 'Hot',
    cap0: 'Puts outnumber calls ({pcr}) with short volume {sv}% — defensive flow observed',
    cap1: 'Options demand leans cautious ({pcr})',
    cap2: 'Puts and calls balanced ({pcr}) — no clear tilt',
    cap3: 'Call demand leads ({pcr}) in a damped-vol regime — warmth observed',
    cap4: 'Heavy call tilt ({pcr}) — overheating signals observed',
    compPcr: 'Put/Call', compGex: 'Gamma', compDp: 'Dark pool', compSv: 'Short vol',
    gexPos: 'Damped +', gexNeg: 'Amplified −',
    breadthUp: 'up', breadthDown: 'down', breadthDp: 'avg dark pool',
    fAll: 'All', fTouch: 'At level', fNear: 'Near',
    sigTitle: "Today's signals", sigSub: 'Within 0.5% · push in the app',
    sigNone: 'Nothing in level range — a quiet tape',
    toLevel: 'to {l}', nearest: 'Nearest',
    callWall: 'Call wall', maxPain: 'Max pain', gammaFlip: 'Gamma flip', putFloor: 'Put floor', last: 'Last',
    touch: 'At level', near: 'Near', watch: 'Quiet',
    radarTitle: 'Level radar', radarSub: 'Your tickers ↔ dealer levels',
    wlPh: 'Add ticker (e.g. NVDA)', wlAdd: 'Add', wlDup: 'Already added', wlBad: 'No data found', wlMax: 'Prototype caps at 10', wlEmpty: 'Add a ticker below to get started',
    del: 'Remove', close: 'Close', ladder: 'Level ladder', spark5: "Today's real session",
    hlTitle: 'Market highlights', hlSub: 'ranked on real data',
    hlDark: 'Dark-pool active', hlSqueeze: 'Squeeze pressure', hlLevel: 'Near a level', seeMore: 'More',
    divHomeTitle: 'This week ex-dividend', divHomeSub: 'watchlist & popular payers', divHomeNone: 'No upcoming ex-dates',
    dday: 'D-{n}', ddayToday: 'Today', exDate: 'Ex-date', payDate: 'Pay', est: 'est.',
    divTitle: 'Dividends', divSub: 'Yield · calendar · calculator · info only',
    rankYield: 'Yield ranking', rankYieldSub: 'trailing 12 months', perYear: '{n}×/yr',
    fMonthly: 'Monthly', fQuarterly: 'Quarterly', fSemi: 'Semi-annual', fAnnual: 'Annual', fWeekly: 'Weekly', fOne: 'One-time', fOther: 'Semi/annual',
    calcTitle: 'Income calculator', calcSub: 'how much you would receive (info, not advice)',
    calcPick: 'Ticker', calcAmount: 'Amount invested', calcYear: 'Est. annual income', calcMonth: 'per month', calcYieldOn: 'yield applied',
    calTitle: 'Ex-dividend calendar', calSub: 'upcoming ex-dates',
    simTitle: 'Understanding ex-dividend', simSub: 'On the ex-date a stock tends to open lower by ~the dividend — educational sim',
    simBefore: 'Before ex-date', simAfter: 'Ex-date open (tendency)', simCash: 'Dividend',
    simNote: 'Because the right to the dividend drops off, the open is observed to tend lower by roughly that amount.',
    meTitle: 'My radar', checkinTitle: 'Check-in streak', checkinSub: 'A 3-second temperature check, daily', days: 'days',
    manageTitle: 'Manage watchlist', langTitle: 'Language',
    disc: 'Educational market information only. Not investment advice; accuracy not guaranteed.',
    proto: 'prototype', by: 'by SIGNUM HQ', lang: 'Language',
  },
  ja: {
    app: 'レベルレーダー', tag: '市場温度 · ディーラーレベル · 3秒チェック',
    tabHome: '温度', tabRadar: 'レーダー', tabDiv: '配当', tabMe: 'マイ',
    tempTitle: '今日の市場温度', live: 'ライブ', loading: '機関データ受信中…',
    b0: '冷却', b1: '涼しい', b2: '中立', b3: '温かい', b4: '過熱',
    cap0: 'プットがコールを上回り({pcr})、空売り出来高{sv}% — 防御的な資金フローが観測されます',
    cap1: 'オプション需要は慎重寄り({pcr})です',
    cap2: 'プット・コールは均衡({pcr}) — 明確な偏りなし',
    cap3: 'コール需要が先行({pcr})し、変動抑制の状態 — 温かさが観測されます',
    cap4: 'コールへの偏り({pcr})が強い — 過熱シグナルが観測されます',
    compPcr: 'P/C', compGex: 'ガンマ', compDp: 'ダークプール', compSv: '空売り',
    gexPos: '抑制 +', gexNeg: '増幅 −',
    breadthUp: '上昇', breadthDown: '下落', breadthDp: '平均ダークプール',
    fAll: 'すべて', fTouch: 'レベル圏', fNear: '接近',
    sigTitle: '今日のシグナル', sigSub: 'レベルまで0.5%以内 · アプリではプッシュ',
    sigNone: '現在レベル圏の銘柄なし — 静かな相場です',
    toLevel: '{l}まで', nearest: '最寄り',
    callWall: 'コールウォール', maxPain: 'マックスペイン', gammaFlip: 'ガンマフリップ', putFloor: 'プットフロア', last: '現在値',
    touch: 'レベル圏', near: '接近', watch: '静観',
    radarTitle: 'レベルレーダー', radarSub: '保有銘柄 ↔ 機関レベルの距離',
    wlPh: 'ティッカー追加 (例: NVDA)', wlAdd: '追加', wlDup: '追加済み', wlBad: 'データ未検出', wlMax: '試作版は10件まで', wlEmpty: '下から銘柄を追加してください',
    del: '削除', close: '閉じる', ladder: 'レベルラダー', spark5: '本日の実セッション',
    hlTitle: '今日の市場ハイライト', hlSub: '実データで抽出',
    hlDark: 'ダークプール活発', hlSqueeze: 'スクイーズ圧力', hlLevel: 'レベル接近', seeMore: 'もっと',
    divHomeTitle: '今週の配当落ち', divHomeSub: 'ウォッチリスト・人気配当銘柄', divHomeNone: '直近の配当落ち予定なし',
    dday: 'D-{n}', ddayToday: '本日', exDate: '配当落ち', payDate: '支払', est: '予想',
    divTitle: '配当情報', divSub: '利回り · カレンダー · 計算機 · 情報提供用',
    rankYield: '配当利回りランキング', rankYieldSub: '直近12か月ベース', perYear: '年{n}回',
    fMonthly: '毎月', fQuarterly: '四半期', fSemi: '半期', fAnnual: '毎年', fWeekly: '毎週', fOne: '一時', fOther: '半期・毎年',
    calcTitle: 'インカム計算機', calcSub: 'いくら投資すればいくら受け取れるか（情報用・助言ではありません）',
    calcPick: '銘柄', calcAmount: '投資額', calcYear: '年間配当（概算）', calcMonth: '月換算', calcYieldOn: '適用利回り',
    calTitle: '配当落ちカレンダー', calSub: '直近の配当落ち日',
    simTitle: '配当落ちを理解する', simSub: '配当落ち日は始値が配当分ほど低く始まる傾向 — 教育用シミュ',
    simBefore: '配当落ち前', simAfter: '配当落ち日の始値（傾向）', simCash: '配当金',
    simNote: '配当を受け取る権利が外れるぶん、始値はおよそその分だけ低く始まる傾向が観測されます。',
    meTitle: 'マイレーダー', checkinTitle: '連続チェックイン', checkinSub: '毎日3秒、市場温度の確認習慣', days: '日',
    manageTitle: 'ウォッチリスト管理', langTitle: '言語',
    disc: '教育目的の市場情報です。投資助言ではなく、正確性は保証されません。',
    proto: 'プロトタイプ', by: 'by SIGNUM HQ', lang: '言語',
  },
};

const C = {
  ink: '#16283A', sub: '#5B7288', faint: '#94A7B8',
  cyan: '#0FB5CB', cyanDeep: '#0891B0', cyanSoft: 'rgba(15,181,203,0.10)',
  amber: '#F59E0B', amberDeep: '#B45309', amberSoft: '#FFF3D6',
  mint: '#10B981', mintDeep: '#047857', mintSoft: 'rgba(16,185,129,0.11)',
  violet: '#7C6CF0', violetSoft: 'rgba(124,108,240,0.11)',
  coral: '#F0644A', coralSoft: 'rgba(240,100,74,0.10)',
  navy: '#23445E', navySoft: 'rgba(35,68,94,0.08)',
  card: '#FFFFFF', line: 'rgba(22,40,58,0.08)',
  shadow: '0 14px 34px rgba(22,40,58,0.09), 0 3px 10px rgba(22,40,58,0.05)',
};

const DEFAULT_WL = ['NVDA', 'TSLA', 'AAPL', 'SPY', 'QQQ', 'META'];
const MARKET_REF = ['SPY', 'QQQ'];
const DISCOVER_UNIVERSE = ['NVDA', 'TSLA', 'AAPL', 'AMD', 'META', 'AMZN', 'MSFT', 'PLTR', 'COIN', 'MSTR', 'SMCI', 'AVGO', 'NFLX', 'GOOGL', 'MU', 'SOFI'];
// popular US dividend ETFs + payers — KR 서학개미 / JP 新NISA favorites first
const DIV_UNIVERSE = ['SCHD', 'JEPI', 'JEPQ', 'QYLD', 'VYM', 'DGRO', 'O', 'DIVO', 'SCHY', 'VIG', 'KO', 'JNJ', 'PEP', 'MO'];
const ETF_SET = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'ARKK', 'SOXL', 'SOXX', 'SMH', 'TQQQ', 'SQQQ', 'TLT', 'GLD', 'SLV', 'USO', 'XLE', 'XLF', 'XLK', 'XLV', 'SCHD', 'JEPI', 'JEPQ', 'QYLD', 'VYM', 'DGRO', 'DIVO', 'SCHY', 'VIG', 'XYLD', 'RYLD']);

const fmtD = (p: number) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%`;
function etDateStr(ms = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
}
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = Date.parse(`${dateStr}T00:00:00-05:00`);
  if (!Number.isFinite(d)) return null;
  return Math.round((d - Date.parse(`${etDateStr()}T00:00:00-05:00`)) / 86_400_000);
}

interface LevelHit { key: 'callWall' | 'maxPain' | 'gammaFlip' | 'putFloor'; value: number; distPct: number }
function nearestLevel(lab: Lab): LevelHit | null {
  if (lab.price == null || lab.price <= 0) return null;
  const cands: LevelHit[] = [];
  const push = (key: LevelHit['key'], v: number | null) => {
    if (v != null && v > 0) cands.push({ key, value: v, distPct: ((v - (lab.price as number)) / (lab.price as number)) * 100 });
  };
  push('callWall', lab.levels.callWall); push('maxPain', lab.levels.maxPain);
  push('gammaFlip', lab.gex.gammaFlip); push('putFloor', lab.levels.putFloor);
  if (!cands.length) return null;
  return cands.sort((a, b) => Math.abs(a.distPct) - Math.abs(b.distPct))[0];
}

function temperature(labs: Lab[]) {
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
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(22,40,58,0.08)',
  } as const;
  if (failed) return <span aria-hidden style={{ ...box, background: C.cyanSoft, color: C.cyanDeep, fontSize: Math.round(size * 0.4), fontWeight: 900 }}>{ticker.slice(0, ETF_SET.has(ticker) ? 3 : 1)}</span>;
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
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
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
      <defs><linearGradient id="rg2" x1="0" y1="1" x2="1" y2="1"><stop offset="0" stopColor="#3E6BFF" /><stop offset="0.45" stopColor={C.cyan} /><stop offset="0.75" stopColor={C.amber} /><stop offset="1" stopColor={C.coral} /></linearGradient></defs>
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="rgba(22,40,58,0.07)" strokeWidth="15" strokeLinecap="round" />
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="url(#rg2)" strokeWidth="15" strokeLinecap="round" strokeDasharray={`${(score / 100) * Math.PI * R} ${Math.PI * R}`} opacity="0.95" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={C.ink} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6.5" fill={C.ink} /><circle cx={cx} cy={cy} r="2.6" fill="#fff" />
      <text x={cx} y={cy - 36} textAnchor="middle" fill={C.ink} fontSize="42" fontWeight="800" fontFamily="inherit">{score}</text>
      <text x={cx} y={cy - 14} textAnchor="middle" fill={bandColor} fontSize="14.5" fontWeight="800" fontFamily="inherit" letterSpacing="3">{band}</text>
    </svg>
  );
}

// premium duotone tab glyphs (thematic: gauge / radar-sweep / coin / person)
function NavGlyph({ tab, color }: { tab: Tab; color: string }) {
  const s = { display: 'block' as const };
  if (tab === 'home') return (
    <svg width="21" height="21" viewBox="0 0 24 24" style={s}>
      <path d="M4.2 15.6a7.8 7.8 0 0 1 15.6 0" fill="none" stroke={color} strokeWidth="2.1" strokeLinecap="round" opacity="0.38" />
      <path d="M12 15.6 L16.7 10.6" stroke={color} strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="12" cy="15.6" r="2.1" fill={color} />
    </svg>);
  if (tab === 'radar') return (
    <svg width="21" height="21" viewBox="0 0 24 24" style={s}>
      <circle cx="12" cy="12" r="8.4" fill="none" stroke={color} strokeWidth="1.6" opacity="0.32" />
      <circle cx="12" cy="12" r="4.6" fill="none" stroke={color} strokeWidth="1.7" opacity="0.62" />
      <path d="M12 12 L18.4 5.6" stroke={color} strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.8" fill={color} />
      <circle cx="16.2" cy="15.4" r="1.7" fill="#F59E0B" />
    </svg>);
  if (tab === 'div') return (
    <svg width="21" height="21" viewBox="0 0 24 24" style={s}>
      <circle cx="12" cy="12" r="8.2" fill="none" stroke={color} strokeWidth="1.7" />
      <path d="M12 6.8v10.4" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M14.7 9.1c-.6-.7-1.6-1.1-2.7-1.1-1.6 0-2.6.8-2.6 1.9 0 2.6 5.5 1.3 5.5 3.9 0 1.1-1 2-2.9 2-1.3 0-2.4-.5-3-1.2" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>);
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" style={s}>
      <circle cx="12" cy="8.2" r="3.6" fill={color} />
      <path d="M5.4 19.6c.7-4 3.5-6 6.6-6s5.9 2 6.6 6a1 1 0 0 1-1 1.2H6.4a1 1 0 0 1-1-1.2Z" fill={color} />
    </svg>);
}

export default function RadarPage() {
  const params = useParams<{ locale: string }>();
  const loc: Lang = params?.locale === 'en' ? 'en' : params?.locale === 'ja' ? 'ja' : 'ko';
  const t = T[loc];

  const [tab, setTab] = useState<Tab>('home');
  const [wl, setWl] = useState<string[]>(DEFAULT_WL);
  const [labs, setLabs] = useState<Record<string, Lab>>({});
  const [divs, setDivs] = useState<Record<string, DivData>>({});
  const [loaded, setLoaded] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [wlMsg, setWlMsg] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'touch' | 'near'>('all');
  const [streak, setStreak] = useState(0);
  const [calcTk, setCalcTk] = useState('SCHD');
  const [calcAmt, setCalcAmt] = useState('10000');
  const [simTk, setSimTk] = useState('JEPI');
  const [divFilter, setDivFilter] = useState<'all' | 'monthly' | 'quarterly' | 'other'>('all');

  const freqLoc = (fl: string | null) => fl == null ? '' : ({ monthly: t.fMonthly, quarterly: t.fQuarterly, 'semi-annual': t.fSemi, annual: t.fAnnual, weekly: t.fWeekly, 'one-time': t.fOne, 'bi-monthly': t.fMonthly, 'semi-monthly': t.fMonthly } as Record<string, string>)[fl] || fl;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('radar.wl') || 'null');
      if (Array.isArray(saved) && saved.length) setWl(saved.slice(0, 10));
      const today = etDateStr();
      const last = localStorage.getItem('radar.checkin.last');
      let s = parseInt(localStorage.getItem('radar.checkin.streak') || '0', 10) || 0;
      if (last !== today) { s = last === etDateStr(Date.now() - 86_400_000) ? s + 1 : 1; localStorage.setItem('radar.checkin.last', today); localStorage.setItem('radar.checkin.streak', String(s)); }
      else if (s < 1) { s = 1; localStorage.setItem('radar.checkin.streak', '1'); }
      setStreak(s);
    } catch { /* noop */ }
  }, []);

  const fetchLab = useCallback(async (tk: string): Promise<Lab | null> => {
    try { const r = await fetch(`/api/wim/lab?t=${encodeURIComponent(tk)}`); if (!r.ok) return null; const j = await r.json(); return j && j.ticker ? (j as Lab) : null; } catch { return null; }
  }, []);
  const fetchDiv = useCallback(async (tk: string): Promise<DivData | null> => {
    try {
      const r = await fetch(`/api/dividends?t=${encodeURIComponent(tk)}`); if (!r.ok) return null;
      const j = await r.json(); if (!j?.success) return null;
      return { ticker: tk, price: j.price ?? null, yieldPct: j.current?.yieldPct ?? null, ttmYieldPct: j.current?.ttmYieldPct ?? null, freqLabel: j.current?.freqLabel ?? null, cash: j.current?.cash ?? null, annualPerShare: j.current?.annualPerShare ?? null, nextExDate: j.current?.nextExDate ?? null, nextExEstimated: !!j.current?.nextExEstimated, lastExDate: j.current?.lastExDate ?? null, payDate: j.current?.payDate ?? null };
    } catch { return null; }
  }, []);
  const loadLabs = useCallback(async (tickers: string[]) => {
    const pairs = await Promise.all(tickers.map(async (tk) => [tk, await fetchLab(tk)] as const));
    setLabs((prev) => { const n = { ...prev }; pairs.forEach(([tk, lb]) => { if (lb) n[tk] = lb; }); return n; });
  }, [fetchLab]);

  // 1) fast: gauge + watchlist
  useEffect(() => {
    let alive = true;
    Promise.all(Array.from(new Set([...wl, ...MARKET_REF])).map(async (tk) => [tk, await fetchLab(tk)] as const)).then((pairs) => {
      if (!alive) return;
      setLabs((prev) => { const n = { ...prev }; pairs.forEach(([tk, lb]) => { if (lb) n[tk] = lb; }); return n; });
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [wl, fetchLab]);
  // 2) deferred: discover universe (home highlights) + dividend universe
  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(() => {
      if (!alive) return;
      void loadLabs(DISCOVER_UNIVERSE);
      Promise.all(DIV_UNIVERSE.map(async (tk) => [tk, await fetchDiv(tk)] as const)).then((pairs) => {
        if (!alive) return;
        setDivs((prev) => { const n = { ...prev }; pairs.forEach(([tk, d]) => { if (d) n[tk] = d; }); return n; });
      });
    }, 350);
    return () => { alive = false; window.clearTimeout(id); };
  }, [loadLabs, fetchDiv]);

  const temp = useMemo(() => temperature(MARKET_REF.map((tk) => labs[tk]).filter(Boolean) as Lab[]), [labs]);
  const bandIdx = temp.score < 30 ? 0 : temp.score < 45 ? 1 : temp.score < 58 ? 2 : temp.score < 75 ? 3 : 4;
  const band = [t.b0, t.b1, t.b2, t.b3, t.b4][bandIdx];
  const caption = temp.pcr != null ? [t.cap0, t.cap1, t.cap2, t.cap3, t.cap4][bandIdx].replace('{pcr}', temp.pcr.toFixed(2)).replace('{sv}', temp.sv != null ? String(Math.round(temp.sv)) : '—') : null;

  const rows = useMemo(() => wl.map((tk) => ({ tk, lab: labs[tk] as Lab | undefined })).map(({ tk, lab }) => ({ tk, lab, hit: lab ? nearestLevel(lab) : null })).sort((a, b) => (a.hit ? Math.abs(a.hit.distPct) : 99) - (b.hit ? Math.abs(b.hit.distPct) : 99)), [wl, labs]);
  const signals = rows.filter((r) => r.hit && Math.abs(r.hit.distPct) <= 0.5);
  const shown = rows.filter((r) => filter === 'all' ? true : filter === 'touch' ? (r.hit && Math.abs(r.hit.distPct) <= 0.5) : (r.hit && Math.abs(r.hit.distPct) <= 1.5));

  const uni = useMemo(() => DISCOVER_UNIVERSE.map((tk) => labs[tk]).filter((l): l is Lab => !!l && l.price != null), [labs]);
  const breadth = useMemo(() => { const u = uni.filter((l) => l.spark && l.spark.closes.length >= 2); let up = 0, dn = 0; u.forEach((l) => { const c = l.spark!.closes; (c[c.length - 1] >= c[0] ? up++ : dn++); }); const dp = uni.filter((l) => l.darkPoolPct != null); const avgDp = dp.length ? Math.round(dp.reduce((s, l) => s + (l.darkPoolPct as number), 0) / dp.length) : null; return { up, dn, avgDp, n: u.length }; }, [uni]);
  const topDark = useMemo(() => [...uni].filter((l) => l.darkPoolPct != null).sort((a, b) => (b.darkPoolPct as number) - (a.darkPoolPct as number))[0], [uni]);
  const topSqueeze = useMemo(() => [...uni].filter((l) => l.squeeze?.riskScore != null).sort((a, b) => (b.squeeze.riskScore as number) - (a.squeeze.riskScore as number))[0], [uni]);
  const topLevel = useMemo(() => [...uni].map((l) => ({ l, h: nearestLevel(l) })).filter((x) => x.h).sort((a, b) => Math.abs((a.h as LevelHit).distPct) - Math.abs((b.h as LevelHit).distPct))[0], [uni]);
  const rankLevelList = useMemo(() => [...uni].map((l) => ({ l, h: nearestLevel(l) })).filter((x) => x.h).sort((a, b) => Math.abs((a.h as LevelHit).distPct) - Math.abs((b.h as LevelHit).distPct)).slice(0, 5), [uni]);

  const divList = useMemo(() => DIV_UNIVERSE.map((tk) => divs[tk]).filter((d): d is DivData => !!d), [divs]);
  const freqCat = (fl: string | null) => fl === 'monthly' || fl === 'bi-monthly' || fl === 'semi-monthly' || fl === 'weekly' ? 'monthly' : fl === 'quarterly' ? 'quarterly' : 'other';
  const yieldRank = useMemo(() => [...divList].filter((d) => d.ttmYieldPct != null).sort((a, b) => (b.ttmYieldPct as number) - (a.ttmYieldPct as number)), [divList]);
  const yieldShown = useMemo(() => divFilter === 'all' ? yieldRank : yieldRank.filter((d) => freqCat(d.freqLabel) === divFilter), [yieldRank, divFilter]);
  const exCalendar = useMemo(() => [...divList].map((d) => ({ d, dd: daysUntil(d.nextExDate) })).filter((x) => x.dd != null && (x.dd as number) >= 0).sort((a, b) => (a.dd as number) - (b.dd as number)), [divList]);
  const homeExSoon = exCalendar.filter((x) => (x.dd as number) <= 10).slice(0, 4);
  const calcDiv = divs[calcTk];
  const calcY = calcDiv?.ttmYieldPct ?? calcDiv?.yieldPct ?? null;
  const calcAmtN = parseFloat(calcAmt.replace(/[^0-9.]/g, '')) || 0;
  const calcAnnual = calcY != null ? calcAmtN * (calcY / 100) : null;
  const simDiv = divs[simTk];

  const addTicker = async (fromTk?: string) => {
    const tk = (fromTk || input).trim().toUpperCase();
    if (!/^[A-Z]{1,6}$/.test(tk)) return;
    if (wl.includes(tk)) { setWlMsg(t.wlDup); return; }
    if (wl.length >= 10) { setWlMsg(t.wlMax); return; }
    if (!fromTk) setWlMsg('…');
    const lb = labs[tk] || await fetchLab(tk);
    if (!lb || lb.price == null) { setWlMsg(t.wlBad); return; }
    const next = [...wl, tk]; setWl(next); setInput(''); setWlMsg('');
    try { localStorage.setItem('radar.wl', JSON.stringify(next)); } catch { /* noop */ }
  };
  const rmTicker = (tk: string) => { const next = wl.filter((x) => x !== tk); setWl(next); try { localStorage.setItem('radar.wl', JSON.stringify(next)); } catch { /* noop */ } };

  const levelName: Record<LevelHit['key'], string> = { callWall: t.callWall, maxPain: t.maxPain, gammaFlip: t.gammaFlip, putFloor: t.putFloor };
  const chipFor = (d: number | null) => d == null ? { label: t.watch, color: C.faint, bg: 'rgba(148,167,184,0.13)' } : Math.abs(d) <= 0.5 ? { label: t.touch, color: C.amberDeep, bg: C.amberSoft } : Math.abs(d) <= 1.5 ? { label: t.near, color: C.cyanDeep, bg: C.cyanSoft } : { label: t.watch, color: C.faint, bg: 'rgba(148,167,184,0.13)' };
  const dLab = detail ? labs[detail] : null;

  const sectionHead = (title: string, sub: string, extra?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 3px' }}>
      <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 850 }}>{title}</h2>
      {sub && <span style={{ marginLeft: extra ? 0 : 'auto', fontSize: 9.5, fontWeight: 700, color: C.faint }}>{sub}</span>}
      {extra}
    </div>
  );
  const ddayChip = (dd: number) => dd === 0 ? t.ddayToday : t.dday.replace('{n}', String(dd));

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #EAF4FA 0%, #F6FAFD 34%, #FDF8F1 100%)', color: C.ink, fontFamily: "-apple-system,'SF Pro','Inter','Pretendard',sans-serif" }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 16px calc(96px + env(safe-area-inset-bottom))' }}>

        {/* masthead */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'calc(14px + env(safe-area-inset-top))' }}>
          <span aria-hidden style={{ width: 42, height: 42, borderRadius: 14, background: C.card, boxShadow: C.shadow, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="25" height="25" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" fill="none" stroke={C.cyan} strokeWidth="1.5" opacity="0.4" /><circle cx="12" cy="12" r="5.2" fill="none" stroke={C.cyan} strokeWidth="1.5" opacity="0.75" />
              <path d="M12 12 L19 5.5" stroke={C.cyanDeep} strokeWidth="2.1" strokeLinecap="round" /><circle cx="12" cy="12" r="1.8" fill={C.cyanDeep} /><circle cx="16.6" cy="15.4" r="1.7" fill={C.amber} />
            </svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17.5, fontWeight: 850, letterSpacing: '-0.02em' }}>{t.app}</div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: C.sub, marginTop: 1 }}>{t.tag}</div>
          </div>
          {streak > 0 && (
            <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, background: C.amberSoft, color: C.amberDeep, borderRadius: 99, padding: '7px 12px', fontSize: 12, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={C.amber}><path d="M12 2c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-1.5-.4-2.3C18.6 8 20 10.6 20 13.5A8 8 0 1 1 6.6 8C7 10 8 11 9 11c-1-3 1-6 3-9Z" /></svg>{streak}
            </span>
          )}
        </header>

        {/* ══ TAB: 온도 (rich home) ══ */}
        {tab === 'home' && (
          <>
            {/* breadth strip */}
            {breadth.n > 0 && (
              <div className="no-sb" style={{ display: 'flex', gap: 7, overflowX: 'auto', margin: '13px -16px 0', padding: '2px 16px', WebkitOverflowScrolling: 'touch' }}>
                {[
                  { k: t.tempTitle.split(' ')[0], v: `${band} ${temp.score}`, c: C.cyanDeep },
                  { k: t.breadthUp, v: `${breadth.up}`, c: C.mintDeep },
                  { k: t.breadthDown, v: `${breadth.dn}`, c: C.coral },
                  { k: t.breadthDp, v: breadth.avgDp != null ? `${breadth.avgDp}%` : '—', c: C.violet },
                ].map((p) => (
                  <span key={p.k} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, background: C.card, borderRadius: 99, padding: '7px 13px', boxShadow: C.shadow, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: 10, fontWeight: 750, color: C.sub }}>{p.k}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 900, color: p.c }}>{p.v}</span>
                  </span>
                ))}
              </div>
            )}

            {/* gauge hero */}
            <section style={{ marginTop: 13, background: C.card, borderRadius: 26, padding: '17px 16px 13px', boxShadow: C.shadow, position: 'relative', overflow: 'hidden' }}>
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
              ) : <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, fontSize: 12, fontWeight: 700 }}>{t.loading}</div>}
            </section>

            {/* signals */}
            <section style={{ marginTop: 16 }}>
              {sectionHead(t.sigTitle, t.sigSub)}
              {loaded && signals.length === 0 && <div style={{ marginTop: 9, background: 'rgba(255,255,255,0.6)', border: `1.5px dashed ${C.line}`, borderRadius: 18, padding: '13px 14px', fontSize: 11.5, fontWeight: 700, color: C.sub, textAlign: 'center' }}>{t.sigNone}</div>}
              {signals.map(({ tk, hit }) => (
                <button key={tk} type="button" onClick={() => setDetail(tk)} style={{ font: 'inherit', width: '100%', textAlign: 'left', cursor: 'pointer', marginTop: 9, display: 'flex', alignItems: 'center', gap: 11, background: 'linear-gradient(120deg, #FFF6E0 0%, #FFEDC2 100%)', border: 'none', borderRadius: 18, padding: '13px 14px', boxShadow: '0 10px 24px rgba(245,158,11,0.16)' }}>
                  <TickerLogo ticker={tk} size={34} />
                  <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 13.5, fontWeight: 900, color: C.ink }}>{tk}</span><span style={{ display: 'block', marginTop: 1, fontSize: 11, fontWeight: 800, color: C.amberDeep }}>{t.toLevel.replace('{l}', levelName[(hit as LevelHit).key])} {fmtD((hit as LevelHit).distPct)}</span></span>
                  <span aria-hidden style={{ width: 9, height: 9, borderRadius: 99, background: C.amber, boxShadow: '0 0 9px rgba(245,158,11,0.8)' }} /><span style={{ color: C.amberDeep, fontWeight: 900 }}>›</span>
                </button>
              ))}
            </section>

            {/* market highlights (folded discover) */}
            {uni.length > 0 && (
              <section style={{ marginTop: 18 }}>
                {sectionHead(t.hlTitle, t.hlSub)}
                <div className="no-sb" style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '10px -16px 0', padding: '2px 16px 6px', WebkitOverflowScrolling: 'touch' }}>
                  {[
                    topLevel && { l: topLevel.l, label: t.hlLevel, val: fmtD((topLevel.h as LevelHit).distPct), c: C.amber, bg: C.amberSoft },
                    topDark && { l: topDark, label: t.hlDark, val: `${Math.round(topDark.darkPoolPct as number)}%`, c: C.violet, bg: C.violetSoft },
                    topSqueeze && { l: topSqueeze, label: t.hlSqueeze, val: String(Math.round(topSqueeze.squeeze.riskScore as number)), c: C.coral, bg: C.coralSoft },
                  ].filter(Boolean).map((x: any) => (
                    <button key={x.label} type="button" onClick={() => setDetail(x.l.ticker)} style={{ font: 'inherit', cursor: 'pointer', flexShrink: 0, width: 156, textAlign: 'left', background: C.card, border: 'none', borderRadius: 20, padding: '13px 14px', boxShadow: C.shadow }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: 3, background: x.c }} /><span style={{ fontSize: 10, fontWeight: 850, color: C.sub }}>{x.label}</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}><TickerLogo ticker={x.l.ticker} size={30} /><span style={{ fontSize: 14, fontWeight: 900 }}>{x.l.ticker}</span></div>
                      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900, color: x.c, fontVariantNumeric: 'tabular-nums' }}>{x.val}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* this-week ex-dividend preview → 배당 tab */}
            {homeExSoon.length > 0 && (
              <section style={{ marginTop: 18 }}>
                {sectionHead(t.divHomeTitle, '', <button type="button" onClick={() => { setTab('div'); window.scrollTo(0, 0); }} style={{ font: 'inherit', marginLeft: 'auto', cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 850, color: C.cyanDeep }}>{t.seeMore} ›</button>)}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {homeExSoon.map(({ d, dd }) => (
                    <button key={d.ticker} type="button" onClick={() => { setTab('div'); window.scrollTo(0, 0); }} style={{ font: 'inherit', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, background: C.card, border: 'none', borderRadius: 18, padding: '12px 14px', boxShadow: C.shadow }}>
                      <TickerLogo ticker={d.ticker} size={32} />
                      <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 13, fontWeight: 900 }}>{d.ticker}</span>{d.nextExEstimated && <span style={{ fontSize: 8, fontWeight: 850, color: C.faint, background: 'rgba(148,167,184,0.14)', borderRadius: 6, padding: '1px 6px' }}>{t.est}</span>}</span><span style={{ display: 'block', fontSize: 10.5, fontWeight: 750, color: C.sub }}>{t.exDate} {d.nextExDate} · {d.ttmYieldPct != null ? `${d.ttmYieldPct.toFixed(1)}%` : ''}</span></span>
                      <span style={{ fontSize: 11, fontWeight: 900, color: (dd as number) <= 2 ? C.amberDeep : C.cyanDeep, background: (dd as number) <= 2 ? C.amberSoft : C.cyanSoft, borderRadius: 99, padding: '5px 11px', flexShrink: 0 }}>{ddayChip(dd as number)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
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
                      <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: 14, fontWeight: 900, letterSpacing: '0.01em' }}>{tk}</span><span style={{ display: 'block', fontSize: 11, fontWeight: 750, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>{lab?.price != null ? `$${lab.price.toFixed(2)}` : '…'}</span></span>
                      <span style={{ marginLeft: 'auto' }}>{lab?.spark && lab.spark.closes.length >= 8 && <MiniSpark closes={lab.spark.closes} color={sparkColor} />}</span>
                      <span style={{ fontSize: 9, fontWeight: 900, color: chip.color, background: chip.bg, borderRadius: 99, padding: '4px 10px', flexShrink: 0 }}>{chip.label}</span>
                    </div>
                    {hit && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 10.5, fontWeight: 750, color: C.sub }}>
                          <span style={{ color: C.faint, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.05em' }}>{t.nearest.toUpperCase()}</span><span style={{ color: C.ink, fontWeight: 850 }}>{levelName[hit.key]} ${hit.value}</span><span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: Math.abs(hit.distPct) <= 0.5 ? C.amberDeep : C.cyanDeep, fontWeight: 900 }}>{fmtD(hit.distPct)}</span>
                        </div>
                        <div style={{ marginTop: 6, height: 6, background: 'rgba(22,40,58,0.06)', borderRadius: 99, overflow: 'hidden' }}><div style={{ width: `${barPct * 100}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${C.cyan}, ${Math.abs(hit.distPct) <= 0.5 ? C.amber : C.cyanDeep})` }} /></div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input value={input} onChange={(e) => { setInput(e.target.value.toUpperCase()); setWlMsg(''); }} onKeyDown={(e) => { if (e.key === 'Enter') void addTicker(); }} placeholder={t.wlPh} style={{ font: 'inherit', flex: 1, minWidth: 0, background: C.card, color: C.ink, border: 'none', boxShadow: C.shadow, borderRadius: 15, padding: '12px 14px', fontSize: 13, fontWeight: 800, outline: 'none', letterSpacing: '0.03em' }} />
              <button type="button" onClick={() => void addTicker()} style={{ font: 'inherit', flexShrink: 0, background: `linear-gradient(135deg, ${C.cyan}, ${C.cyanDeep})`, color: '#fff', border: 'none', borderRadius: 15, padding: '0 19px', fontSize: 13, fontWeight: 900, cursor: 'pointer', boxShadow: '0 8px 20px rgba(15,181,203,0.35)' }}>{t.wlAdd}</button>
            </div>
            {wlMsg && <div style={{ marginTop: 6, fontSize: 10.5, fontWeight: 750, color: C.amberDeep }}>{wlMsg}</div>}
          </section>
        )}

        {/* ══ TAB: 배당 ══ */}
        {tab === 'div' && (
          <section style={{ marginTop: 16 }}>
            {sectionHead(t.divTitle, t.divSub)}

            {/* income calculator */}
            <div style={{ marginTop: 12, background: 'linear-gradient(150deg,#EAFBF3,#D9F5E9)', borderRadius: 22, padding: '15px 15px', boxShadow: '0 12px 28px rgba(16,185,129,0.14)' }}>
              <div style={{ fontSize: 13.5, fontWeight: 900, color: C.mintDeep }}>{t.calcTitle}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.mintDeep, opacity: 0.8, marginTop: 2 }}>{t.calcSub}</div>
              <div className="no-sb" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '11px -15px 0', padding: '0 15px' }}>
                {DIV_UNIVERSE.map((tk) => (
                  <button key={tk} type="button" onClick={() => setCalcTk(tk)} style={{ font: 'inherit', flexShrink: 0, cursor: 'pointer', border: 'none', borderRadius: 99, padding: '6px 12px', fontSize: 11, fontWeight: 850, background: calcTk === tk ? C.mintDeep : 'rgba(255,255,255,0.75)', color: calcTk === tk ? '#fff' : C.sub }}>{tk}</button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 850, color: C.mintDeep, opacity: 0.7, marginBottom: 3 }}>{t.calcAmount.toUpperCase()}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', borderRadius: 13, padding: '10px 12px', boxShadow: '0 3px 8px rgba(16,185,129,0.1)' }}>
                    <span style={{ fontSize: 15, fontWeight: 900, color: C.ink }}>$</span>
                    <input value={calcAmt} onChange={(e) => setCalcAmt(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))} inputMode="numeric" style={{ font: 'inherit', flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 900, color: C.ink }} />
                  </div>
                </div>
                <TickerLogo ticker={calcTk} size={38} />
              </div>
              <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
                <div style={{ flex: 1, background: '#fff', borderRadius: 14, padding: '11px 12px', textAlign: 'center', boxShadow: '0 3px 8px rgba(16,185,129,0.1)' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 850, color: C.mintDeep, opacity: 0.7 }}>{t.calcYear.toUpperCase()}</div>
                  <div style={{ fontSize: 21, fontWeight: 900, color: C.mintDeep, fontVariantNumeric: 'tabular-nums' }}>{calcAnnual != null ? `$${Math.round(calcAnnual).toLocaleString()}` : '—'}</div>
                </div>
                <div style={{ flex: 1, background: '#fff', borderRadius: 14, padding: '11px 12px', textAlign: 'center', boxShadow: '0 3px 8px rgba(16,185,129,0.1)' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 850, color: C.mintDeep, opacity: 0.7 }}>{t.calcMonth.toUpperCase()}</div>
                  <div style={{ fontSize: 21, fontWeight: 900, color: C.mintDeep, fontVariantNumeric: 'tabular-nums' }}>{calcAnnual != null ? `$${Math.round(calcAnnual / 12).toLocaleString()}` : '—'}</div>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 9.5, fontWeight: 700, color: C.mintDeep, opacity: 0.75, textAlign: 'center' }}>{t.calcYieldOn}: {calcY != null ? `${calcY.toFixed(2)}% · ${freqLoc(calcDiv?.freqLabel ?? null)}` : '…'}</div>
            </div>

            {/* yield ranking + frequency filter */}
            <div style={{ marginTop: 16 }}>{sectionHead(t.rankYield, t.rankYieldSub)}</div>
            <div style={{ display: 'flex', gap: 7, marginTop: 10, overflowX: 'auto' }} className="no-sb">
              {([['all', t.fAll], ['monthly', t.fMonthly], ['quarterly', t.fQuarterly]] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setDivFilter(k)} style={{ font: 'inherit', flexShrink: 0, cursor: 'pointer', border: 'none', borderRadius: 99, padding: '7px 15px', fontSize: 11.5, fontWeight: 850, background: divFilter === k ? C.mintDeep : C.card, color: divFilter === k ? '#fff' : C.sub, boxShadow: divFilter === k ? '0 6px 16px rgba(4,120,87,0.22)' : C.shadow }}>{label}</button>
              ))}
            </div>
            <div style={{ marginTop: 10, background: C.card, borderRadius: 20, padding: '4px 14px', boxShadow: C.shadow }}>
              {yieldShown.length === 0 ? <div style={{ padding: '18px 0', textAlign: 'center', color: C.faint, fontSize: 11, fontWeight: 700 }}>{yieldRank.length === 0 ? t.loading : '—'}</div>
                : yieldShown.map((d, i) => (
                  <div key={d.ticker} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
                    <span style={{ width: 16, fontSize: 11, fontWeight: 900, color: C.faint }}>{i + 1}</span>
                    <TickerLogo ticker={d.ticker} size={30} />
                    <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 13, fontWeight: 900 }}>{d.ticker}</span><span style={{ display: 'block', fontSize: 10, fontWeight: 750, color: C.sub }}>{freqLoc(d.freqLabel)}{d.price != null ? ` · $${d.price.toFixed(2)}` : ''}</span></span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: C.mintDeep, fontVariantNumeric: 'tabular-nums' }}>{d.ttmYieldPct != null ? `${d.ttmYieldPct.toFixed(2)}%` : '—'}</span>
                  </div>
                ))}
            </div>

            {/* ex-dividend calendar */}
            {exCalendar.length > 0 && (
              <>
                <div style={{ marginTop: 16 }}>{sectionHead(t.calTitle, t.calSub)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {exCalendar.slice(0, 8).map(({ d, dd }) => (
                    <div key={d.ticker} style={{ display: 'flex', alignItems: 'center', gap: 11, background: C.card, borderRadius: 16, padding: '11px 14px', boxShadow: C.shadow }}>
                      <TickerLogo ticker={d.ticker} size={30} />
                      <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 12.5, fontWeight: 900 }}>{d.ticker}</span>{d.nextExEstimated && <span style={{ fontSize: 8, fontWeight: 850, color: C.faint, background: 'rgba(148,167,184,0.14)', borderRadius: 6, padding: '1px 6px' }}>{t.est}</span>}</span><span style={{ display: 'block', fontSize: 10, fontWeight: 750, color: C.sub }}>{t.exDate} {d.nextExDate}{d.cash != null ? ` · $${d.cash.toFixed(3)}` : ''}</span></span>
                      <span style={{ fontSize: 11, fontWeight: 900, color: (dd as number) <= 2 ? C.amberDeep : C.cyanDeep, background: (dd as number) <= 2 ? C.amberSoft : C.cyanSoft, borderRadius: 99, padding: '5px 11px' }}>{ddayChip(dd as number)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ex-dividend drop simulation (educational) */}
            <div style={{ marginTop: 16 }}>{sectionHead(t.simTitle, '')}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, padding: '2px 3px 0' }}>{t.simSub}</div>
            <div className="no-sb" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '10px -16px 0', padding: '0 16px' }}>
              {DIV_UNIVERSE.slice(0, 8).map((tk) => (
                <button key={tk} type="button" onClick={() => setSimTk(tk)} style={{ font: 'inherit', flexShrink: 0, cursor: 'pointer', border: 'none', borderRadius: 99, padding: '6px 12px', fontSize: 11, fontWeight: 850, background: simTk === tk ? C.ink : C.card, color: simTk === tk ? '#fff' : C.sub, boxShadow: simTk === tk ? 'none' : C.shadow }}>{tk}</button>
              ))}
            </div>
            <div style={{ marginTop: 11, background: C.card, borderRadius: 20, padding: '16px 16px', boxShadow: C.shadow }}>
              {simDiv && simDiv.price != null && simDiv.cash != null ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, fontWeight: 850, color: C.faint }}>{t.simBefore.toUpperCase()}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>${simDiv.price.toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 850, color: C.coral }}>{t.simCash}</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: C.coral, fontVariantNumeric: 'tabular-nums' }}>−${simDiv.cash.toFixed(3)}</div>
                      <svg width="34" height="12" viewBox="0 0 34 12" style={{ marginTop: 2 }}><path d="M1 6h27m0 0-5-4m5 4-5 4" stroke={C.coral} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, fontWeight: 850, color: C.faint }}>{t.simAfter.toUpperCase()}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: C.cyanDeep, fontVariantNumeric: 'tabular-nums' }}>${(simDiv.price - simDiv.cash).toFixed(2)}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 13, fontSize: 11, lineHeight: 1.6, fontWeight: 700, color: C.sub, textAlign: 'center' }}>{t.simNote}</div>
                </>
              ) : <div style={{ padding: '14px 0', textAlign: 'center', color: C.faint, fontSize: 11, fontWeight: 700 }}>{t.loading}</div>}
            </div>
          </section>
        )}

        {/* ══ TAB: 나 ══ */}
        {tab === 'me' && (
          <section style={{ marginTop: 16 }}>
            {sectionHead(t.meTitle, '')}
            <div style={{ marginTop: 11, background: 'linear-gradient(135deg, #FFF6E0, #FFEACB)', borderRadius: 22, padding: '18px 18px', boxShadow: '0 12px 28px rgba(245,158,11,0.16)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 58, height: 58, borderRadius: 18, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(245,158,11,0.2)' }}><svg width="30" height="30" viewBox="0 0 24 24" fill={C.amber}><path d="M12 2c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-1.5-.4-2.3C18.6 8 20 10.6 20 13.5A8 8 0 1 1 6.6 8C7 10 8 11 9 11c-1-3 1-6 3-9Z" /></svg></div>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 11.5, fontWeight: 900, color: C.amberDeep }}>{t.checkinTitle}</div><div style={{ fontSize: 30, fontWeight: 900, color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{streak}<span style={{ fontSize: 15, marginLeft: 4 }}>{t.days}</span></div><div style={{ fontSize: 10.5, fontWeight: 700, color: C.amberDeep, opacity: 0.85 }}>{t.checkinSub}</div></div>
            </div>
            <div style={{ marginTop: 16 }}>{sectionHead(t.manageTitle, `${wl.length}/10`)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {wl.map((tk) => (
                <span key={tk} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.card, borderRadius: 99, padding: '7px 8px', boxShadow: C.shadow }}>
                  <TickerLogo ticker={tk} size={22} /><span style={{ fontSize: 12.5, fontWeight: 900 }}>{tk}</span>
                  <button type="button" aria-label={t.del} onClick={() => rmTicker(tk)} style={{ font: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: C.faint, fontSize: 15, lineHeight: 1, padding: '0 4px' }}>×</button>
                </span>
              ))}
            </div>
            {/* language — switch right here in settings (inline, one tap) */}
            <div style={{ marginTop: 18 }}>{sectionHead(t.langTitle, '')}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {(['ko', 'en', 'ja'] as Lang[]).map((l) => {
                const active = l === loc;
                const name = l === 'en' ? 'English' : l === 'ja' ? '日本語' : '한국어';
                return (
                  <a key={l} href={`/${l}/radar`} style={{ flex: 1, textAlign: 'center', textDecoration: 'none', borderRadius: 16, padding: '14px 0', fontSize: 13, fontWeight: 850, background: active ? `linear-gradient(150deg, ${C.cyan}, ${C.cyanDeep})` : C.card, color: active ? '#fff' : C.ink, boxShadow: active ? '0 8px 18px rgba(15,181,203,0.28)' : C.shadow }}>
                    {name}{active && ' ✓'}
                  </a>
                );
              })}
            </div>
          </section>
        )}

        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 9.5, color: C.faint, fontWeight: 650, lineHeight: 1.6 }}>{t.disc}<br />{t.app} · {t.proto} · {t.by}</div>
      </div>

      {/* bottom nav */}
      <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', justifyContent: 'center', pointerEvents: 'none', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div style={{ pointerEvents: 'auto', display: 'flex', gap: 4, margin: '0 12px 12px', padding: 6, background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', border: `1px solid ${C.line}`, borderRadius: 22, boxShadow: '0 12px 34px rgba(22,40,58,0.16)', width: 'min(520px, calc(100% - 24px))' }}>
          {(['home', 'radar', 'div', 'me'] as Tab[]).map((k) => {
            const active = tab === k;
            const label = k === 'home' ? t.tabHome : k === 'radar' ? t.tabRadar : k === 'div' ? t.tabDiv : t.tabMe;
            return (
              <button key={k} type="button" aria-label={label} onClick={() => { setTab(k); window.scrollTo(0, 0); }} style={{ font: 'inherit', flex: 1, border: 'none', cursor: 'pointer', borderRadius: 16, padding: '9px 0 7px', background: active ? `linear-gradient(150deg, ${C.cyan}, ${C.cyanDeep})` : 'transparent', color: active ? '#fff' : C.sub, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'background 0.2s ease', boxShadow: active ? '0 8px 18px rgba(15,181,203,0.32)' : 'none' }}>
                <NavGlyph tab={k} color={active ? '#fff' : C.sub} />
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
              <TickerLogo ticker={detail} size={36} /><span style={{ fontSize: 17, fontWeight: 900 }}>{detail}</span><span style={{ fontSize: 12.5, fontWeight: 800, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>{dLab.price != null ? `$${dLab.price.toFixed(2)}` : ''}</span>
              <span style={{ marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, color: C.mint, background: C.mintSoft, borderRadius: 99, padding: '3px 9px' }}>● {t.live}</span>
            </div>
            {dLab.spark && dLab.spark.closes.length >= 8 && <div style={{ marginTop: 13, background: C.cyanSoft, borderRadius: 16, padding: '10px 12px 6px' }}><div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.06em', color: C.cyanDeep, marginBottom: 4 }}>{t.spark5.toUpperCase()}</div><MiniSpark closes={dLab.spark.closes} w={300} h={58} color={C.cyanDeep} /></div>}
            <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '0.06em', color: C.faint, margin: '14px 0 6px' }}>{t.ladder.toUpperCase()}</div>
            {(() => {
              const price = dLab.price;
              const items: { label: string; v: number | null; hi?: boolean }[] = [
                { label: t.callWall, v: dLab.levels.callWall }, { label: t.last, v: price, hi: true }, { label: t.gammaFlip, v: dLab.gex.gammaFlip }, { label: t.maxPain, v: dLab.levels.maxPain }, { label: t.putFloor, v: dLab.levels.putFloor },
              ].filter((x) => x.v != null).sort((a, b) => (b.v as number) - (a.v as number));
              return items.map((it) => (
                <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: it.hi ? C.cyanSoft : 'transparent' }}>
                  <span style={{ width: 96, fontSize: 11, fontWeight: 850, letterSpacing: '0.03em', color: it.hi ? C.cyanDeep : C.sub }}>{it.label.toUpperCase()}</span><span style={{ flex: 1, borderTop: `1.5px ${it.hi ? 'solid' : 'dashed'} ${it.hi ? C.cyan : 'rgba(22,40,58,0.12)'}` }} /><span style={{ width: 62, textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{!it.hi && price != null ? fmtD((((it.v as number) - price) / price) * 100) : ''}</span><span style={{ width: 80, textAlign: 'right', fontSize: it.hi ? 17 : 13.5, fontWeight: 900, color: it.hi ? C.cyanDeep : C.ink, fontVariantNumeric: 'tabular-nums' }}>${it.v}</span>
                </div>
              ));
            })()}
            <div style={{ display: 'flex', gap: 9, marginTop: 15 }}>
              {wl.includes(detail) ? <button type="button" onClick={() => { rmTicker(detail); setDetail(null); }} style={{ font: 'inherit', flex: 1, background: C.coralSoft, color: C.coral, border: 'none', borderRadius: 15, padding: '13px 0', fontSize: 12.5, fontWeight: 850, cursor: 'pointer' }}>{t.del}</button>
                : <button type="button" onClick={() => { void addTicker(detail); setDetail(null); setTab('radar'); }} style={{ font: 'inherit', flex: 1, background: C.mintSoft, color: C.mintDeep, border: 'none', borderRadius: 15, padding: '13px 0', fontSize: 12.5, fontWeight: 850, cursor: 'pointer' }}>+ {t.tabRadar}</button>}
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
              <a key={l} href={`/${l}/radar`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 12px', borderRadius: 13, background: l === loc ? C.cyanSoft : 'transparent', color: l === loc ? C.cyanDeep : C.ink, textDecoration: 'none', fontSize: 13.5, fontWeight: 850 }}>{l === 'en' ? 'English' : l === 'ja' ? '日本語' : '한국어'}{l === loc && <span style={{ marginLeft: 'auto' }}>✓</span>}</a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
