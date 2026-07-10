'use client';

// ============================================================================
// WIM — "Why'd It Move?"  (spin-off #3 web prototype)
// ----------------------------------------------------------------------------
// A 30-second daily habit: today's REAL movers become a cause-and-effect quiz.
// Beginner → institutional depth ladder, streak/XP lock-in, 3-language.
//
// IDENTITY (deliberately unlike SIGNUM's dark terminal and UC's cream
// editorial): bright violet playground — soft lavender paper, bouncy rounded
// cards, a detective mascot, confetti on correct answers.
//
// ADS (structure now, inert until WIM_ADS_LIVE): ① bottom banner slot,
// ② interstitial after finishing the daily set, ③ rewarded gate on the
// institutional deep layer. Flag off → zero ad code paths execute.
//
// COMPLIANCE (hard): observer tone, cause-only questions, NO direction
// arrows/colors on the mover card, streak counts learning DAYS. Educational
// disclaimer everywhere. No prediction mechanics.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { METRIC_GLOSSARY, type MetricTerm } from '@/components/app/metricGlossary';

// ── ads master switch (mirror of UC ADS_LIVE discipline) ──
const WIM_ADS_LIVE = false;

type Lang = 'ko' | 'en' | 'ja';
type Loc = { ko: string; en: string; ja: string };

interface Choice { id: string; categoryId: string; label: Loc }
interface Unit {
  id: string; dateET: string; ticker: string; companyName: string;
  moveMagnitude: number; prompt: Loc; choices: Choice[]; correctCategoryIds: string[];
  explanation: Loc; evidence?: { newsHeadline?: Loc };
  deepRead: Loc | null;
  money: { darkPoolPct: number | null; volumePcr: number | null; squeezeScore: number | null; maxPain: number | null } | null;
  difficultyLevel: 1 | 2 | 3; disclaimer: Loc;
}
interface Today { success: boolean; dateET: string; units: Unit[] }

// ── palette (bright violet playground) ──
const P = {
  bg: '#F6F4FF', card: '#FFFFFF', ink: '#262240', sub: '#5A5580', faint: '#928DB8',
  hero: '#6C5CE7', heroDeep: '#5344D6', heroSoft: '#E9E5FF',
  coral: '#FF7A59', coralSoft: '#FFE9E2',
  mint: '#19B893', mintSoft: '#DCF6EE',
  amber: '#FFAD1F', amberSoft: '#FFF2D9',
  line: '#E7E3F7', shadow: '0 10px 26px rgba(76,63,175,0.10)',
};

// ── i18n ──
const T: Record<Lang, Record<string, string>> = {
  ko: {
    tagline: '오늘 시장이 낸 문제, 30초 수업',
    todaysSet: '오늘의 문제', done: '완료', ofToday: '오늘 학습',
    weekDays: '월,화,수,목,금,토,일',
    streakLine1: '이번 주', streakLine2: '일 학습했어요',
    keepGoing: '좋아요, 계속 가요!', startToday: '오늘 문제로 두뇌를 깨워봐요',
    level: '레벨', xp: 'XP', toNext: '다음 레벨까지',
    lv1: '견습 탐정', lv2: '주니어 탐정', lv3: '시니어 탐정', lv4: '수석 탐정', lv5: '기관급 탐정',
    moved: '오늘 크게 움직임', whatHappened: '왜 움직였을까?',
    warmup: '첫 문제는 타이머 없이 천천히!',
    correct: '정답!', notQuite: '괜찮아요 — 이렇게 배우는 거예요',
    theWhy: '무슨 일이었나', receipt: '근거 기사',
    deepTitle: '기관급 시선', deepSub: '같은 움직임을 트레이딩 데스크는 이렇게 봐요',
    deepLocked: '광고 보고 기관급 시선 열기', deepFree: '지금은 무료로 열려 있어요',
    dp: '다크풀 비중', pcr: '풋/콜 비율', squeeze: '스퀴즈 점수', maxPain: '맥스 페인',
    next: '다음 문제', finish: '오늘 학습 끝!', backHome: '홈으로',
    setDone: '오늘 세트 완료', setDoneSub: '내일 새 문제가 준비돼요. 스트릭을 지켜보세요!',
    curriculum: '개념 사전', curriculumSub: '낮은 곳부터 기관급까지 — 탭해서 배워요',
    depth1: '기초', depth2: '중급', depth3: '기관급',
    learned: '학습함', close: '확인',
    quizLv1: '기초', quizLv2: '중급', quizLv3: '기관급',
    adBanner: '광고 영역', adInterstitial: '광고 후 계속됩니다',
    langBtn: '한국어',
    empty: '오늘 문제를 준비하고 있어요 — 잠시 후 다시 열어주세요.',
    play: '풀기', replay: '다시 보기',
  },
  en: {
    tagline: "Today's market, a 30-second lesson",
    todaysSet: "Today's questions", done: 'done', ofToday: 'learned today',
    weekDays: 'M,T,W,T,F,S,S',
    streakLine1: 'This week', streakLine2: 'days of learning',
    keepGoing: 'Nice — keep it going!', startToday: "Wake your brain up with today's set",
    level: 'Level', xp: 'XP', toNext: 'to next level',
    lv1: 'Rookie Detective', lv2: 'Junior Detective', lv3: 'Senior Detective', lv4: 'Lead Detective', lv5: 'Desk-grade Detective',
    moved: 'moved big today', whatHappened: 'Why did it move?',
    warmup: 'First one is timer-free — take your time!',
    correct: 'Correct!', notQuite: "No worries — that's how you learn",
    theWhy: 'What happened', receipt: 'The receipt',
    deepTitle: 'The institutional lens', deepSub: 'How a trading desk reads the same move',
    deepLocked: 'Watch an ad to unlock the desk view', deepFree: 'Open free for now',
    dp: 'Dark-pool share', pcr: 'Put/Call ratio', squeeze: 'Squeeze score', maxPain: 'Max pain',
    next: 'Next question', finish: "Today's learning done!", backHome: 'Home',
    setDone: 'Set complete', setDoneSub: 'Fresh questions tomorrow. Protect that streak!',
    curriculum: 'Concept library', curriculumSub: 'From basics to desk-grade — tap to learn',
    depth1: 'Basics', depth2: 'Intermediate', depth3: 'Institutional',
    learned: 'learned', close: 'Got it',
    quizLv1: 'Basic', quizLv2: 'Mid', quizLv3: 'Pro',
    adBanner: 'Ad space', adInterstitial: 'Continuing after the ad',
    langBtn: 'English',
    empty: "Preparing today's questions — check back shortly.",
    play: 'Play', replay: 'Review',
  },
  ja: {
    tagline: '今日の市場が出す問題、30秒レッスン',
    todaysSet: '今日の問題', done: '完了', ofToday: '今日の学習',
    weekDays: '月,火,水,木,金,土,日',
    streakLine1: '今週', streakLine2: '日学びました',
    keepGoing: 'いい調子、続けよう！', startToday: '今日の問題で頭を起こそう',
    level: 'レベル', xp: 'XP', toNext: '次のレベルまで',
    lv1: '見習い探偵', lv2: 'ジュニア探偵', lv3: 'シニア探偵', lv4: 'リード探偵', lv5: '機関級探偵',
    moved: '今日大きく動いた', whatHappened: 'なぜ動いた？',
    warmup: '最初の1問はタイマーなし、ゆっくりどうぞ！',
    correct: '正解！', notQuite: '大丈夫 — こうやって学ぶんです',
    theWhy: '何があったか', receipt: '根拠記事',
    deepTitle: '機関投資家の視点', deepSub: '同じ値動きをデスクはこう読む',
    deepLocked: '広告を見てデスク視点を開く', deepFree: '今は無料で開放中',
    dp: 'ダークプール比率', pcr: 'プット/コール', squeeze: 'スクイーズ', maxPain: 'マックスペイン',
    next: '次の問題', finish: '今日の学習おわり！', backHome: 'ホームへ',
    setDone: '今日のセット完了', setDoneSub: '明日また新しい問題。ストリークを守ろう！',
    curriculum: '概念ライブラリ', curriculumSub: '基礎から機関級まで — タップで学ぶ',
    depth1: '基礎', depth2: '中級', depth3: '機関級',
    learned: '学習済み', close: '閉じる',
    quizLv1: '基礎', quizLv2: '中級', quizLv3: '機関級',
    adBanner: '広告スペース', adInterstitial: '広告のあと続きます',
    langBtn: '日本語',
    empty: '今日の問題を準備中 — 少し後にまた開いてください。',
    play: '解く', replay: '復習',
  },
};

// curriculum depth shelves (glossary terms mapped to the education ladder)
const DEPTH_TERMS: Record<1 | 2 | 3, MetricTerm[]> = {
  1: ['rsi', 'vwap', 'trendPhase', 'fundamental', 'shortInterest'],
  2: ['pcr', 'squeeze', 'volRegime', 'ivRank', 'impliedMove', 'conviction', 'insiderActivity', 'institutional13f'],
  3: ['darkPool', 'blockTrades', 'whale', 'gex', 'gammaFlip', 'callWall', 'putFloor', 'maxPain', 'netPremium', 'opi', 'ivSkew', 'gexTimeline'],
};

const XP_CORRECT = 20;
const XP_TRIED = 10;
const XP_PER_LEVEL = 100;

// local weekday index (NOT UTC — a KST learning day must count as that day)
function weekdayIdx(): number { return (new Date().getDay() + 6) % 7; } // Mon=0..Sun=6

// ticker logo via the existing proxy (monogram fallback)
function TickerLogo({ ticker, size = 22 }: { ticker: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = {
    width: size, height: size, minWidth: size, borderRadius: '50%', flexShrink: 0,
    overflow: 'hidden', background: '#fff', border: `1.5px solid ${P.line}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  } as const;
  if (failed) {
    return <span aria-hidden style={{ ...box, background: P.heroSoft, color: P.hero, fontSize: Math.round(size * 0.5), fontWeight: 900 }}>{ticker[0]}</span>;
  }
  return (
    <span aria-hidden style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/undercurrent/logo?t=${ticker}`} alt="" onError={() => setFailed(true)} style={{ width: '76%', height: '76%', objectFit: 'contain', display: 'block' }} />
    </span>
  );
}

// **bold** parser for explanations
function Bold({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((s, i) => (i % 2 === 1
        ? <strong key={i} style={{ color: P.hero, fontWeight: 900 }}>{s}</strong>
        : <span key={i}>{s}</span>))}
    </>
  );
}

// Calm-style weekly streak ring + dots (onDark = rendered inside the violet hero)
function StreakRing({ days, t }: { days: number; t: Record<string, string> }) {
  const pct = Math.min(1, days / 7);
  const R = 34; const CIRC = 2 * Math.PI * R;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }}>
        <svg width="92" height="92" viewBox="0 0 92 92">
          <circle cx="46" cy="46" r={R} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="9" />
          <circle
            cx="46" cy="46" r={R} fill="none" stroke="#FFD66B" strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${CIRC * Math.max(0.015, pct)} ${CIRC}`} transform="rotate(-90 46 46)"
            style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1)' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{days}</span>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.05em' }}>DAYS</span>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 900, color: '#fff' }}>
          {t.streakLine1} <span style={{ color: '#FFD66B' }}>{days}</span>{t.streakLine2}
        </div>
        <div style={{ fontSize: 12, fontWeight: 650, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>
          {days > 0 ? t.keepGoing : t.startToday}
        </div>
      </div>
    </div>
  );
}

export default function WimPage() {
  const params = useParams();
  const router = useRouter();
  const loc: Lang = params?.locale === 'en' ? 'en' : params?.locale === 'ja' ? 'ja' : 'ko';
  const t = T[loc];

  const [today, setToday] = useState<Today | null>(null);
  const [failed, setFailed] = useState(false);

  // on-device learner state
  const [xp, setXp] = useState(0);
  const [week, setWeek] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [done, setDone] = useState<Record<string, string>>({}); // unitId -> chosen categoryId
  const [seenTerms, setSeenTerms] = useState<Record<string, boolean>>({});
  const [everPlayed, setEverPlayed] = useState(true); // first-ever quiz = timer off

  // quiz flow
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [deepOpen, setDeepOpen] = useState(false);
  const [remain, setRemain] = useState(8);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [setDoneShown, setSetDoneShown] = useState(false);
  const [glossOpen, setGlossOpen] = useState<MetricTerm | null>(null);

  // ── boot: restore local state + fetch today's set (instant-paint + SWR refresh) ──
  useEffect(() => {
    try {
      setXp(parseInt(localStorage.getItem('wim.xp') || '0', 10) || 0);
      setDone(JSON.parse(localStorage.getItem('wim.done') || '{}'));
      setSeenTerms(JSON.parse(localStorage.getItem('wim.terms') || '{}'));
      setEverPlayed(localStorage.getItem('wim.played') === '1');
      const wk = JSON.parse(localStorage.getItem('wim.week') || 'null');
      const wkKey = localStorage.getItem('wim.weekKey') || '';
      // reset the week dots every Monday
      const now = new Date();
      const monday = new Date(now); monday.setDate(now.getDate() - weekdayIdx());
      const mondayKey = `${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
      if (Array.isArray(wk) && wkKey === mondayKey) setWeek(wk);
      else { localStorage.setItem('wim.weekKey', mondayKey); localStorage.setItem('wim.week', JSON.stringify([false, false, false, false, false, false, false])); }
    } catch { /* storage unavailable */ }
    let hadCache = false;
    try {
      const cached = localStorage.getItem('wim.today');
      if (cached) {
        const j = JSON.parse(cached);
        if (j?.units?.length) { setToday(j); hadCache = true; }
      }
    } catch { /* storage unavailable */ }

    let alive = true;
    fetch('/api/wim/today')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (j?.success && j.units?.length) {
          setToday(j);
          try { localStorage.setItem('wim.today', JSON.stringify(j)); } catch {}
          if (j._stale) fetch('/api/wim/today?refresh=1').then((r) => (r.ok ? r.json() : null)).then((f) => {
            if (alive && f?.success && f.units?.length) { setToday(f); try { localStorage.setItem('wim.today', JSON.stringify(f)); } catch {} }
          }).catch(() => {});
        } else if (!hadCache) setFailed(true);
      })
      .catch(() => { if (alive && !hadCache) setFailed(true); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const units = today?.units || [];
  const doneCount = units.filter((u) => done[u.id]).length;
  const streakDays = week.filter(Boolean).length;
  const levelIdx = Math.min(4, Math.floor(xp / XP_PER_LEVEL));
  const levelNames = [t.lv1, t.lv2, t.lv3, t.lv4, t.lv5];
  const levelPct = Math.min(1, (xp % XP_PER_LEVEL) / XP_PER_LEVEL);

  const persist = useCallback((k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} }, []);

  // ── quiz timer (8s, first-ever play = off, timeout just reveals — no penalty) ──
  const stopTimer = useCallback(() => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }, []);
  const startQuiz = useCallback((idx: number) => {
    setActiveIdx(idx); setPicked(null); setDeepOpen(false); setRemain(8);
    stopTimer();
    if (everPlayed) {
      timerRef.current = setInterval(() => {
        setRemain((r) => {
          if (r <= 1) { stopTimer(); setPicked('__timeout__'); return 0; }
          return r - 1;
        });
      }, 1000);
    }
    window.scrollTo(0, 0);
  }, [everPlayed, stopTimer]);

  // shared bookkeeping: XP + done + week dot + first-play flag (answer AND timeout)
  const record = useCallback((u: Unit, categoryId: string) => {
    if (done[u.id]) return;
    const correct = u.correctCategoryIds.includes(categoryId);
    const gain = correct ? XP_CORRECT : XP_TRIED;
    const nxp = xp + gain;
    setXp(nxp); persist('wim.xp', String(nxp));
    const nd = { ...done, [u.id]: categoryId };
    setDone(nd); persist('wim.done', JSON.stringify(nd));
    const w = [...week]; w[weekdayIdx()] = true;
    setWeek(w); persist('wim.week', JSON.stringify(w));
    if (!everPlayed) { setEverPlayed(true); persist('wim.played', '1'); }
  }, [done, xp, week, everPlayed, persist]);

  const answer = useCallback((u: Unit, categoryId: string) => {
    if (picked) return;
    stopTimer();
    setPicked(categoryId);
    record(u, categoryId);
  }, [picked, record, stopTimer]);

  // the 8s timer expiring still counts as a learning attempt (tried-XP, day dot)
  useEffect(() => {
    if (picked !== '__timeout__' || activeIdx == null) return;
    const u = units[activeIdx];
    if (u) record(u, '__timeout__');
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeQuiz = useCallback((finishedAll: boolean) => {
    stopTimer(); setActiveIdx(null); setPicked(null); setDeepOpen(false);
    if (finishedAll && !setDoneShown) {
      setSetDoneShown(true);
      // ② interstitial slot — fires here when ads go live (one per set, capped)
      // if (WIM_ADS_LIVE) showWimInterstitial();
    }
    window.scrollTo(0, 0);
  }, [stopTimer, setDoneShown]);

  const markTerm = useCallback((term: MetricTerm) => {
    setGlossOpen(term);
    if (!seenTerms[term]) {
      const ns = { ...seenTerms, [term]: true };
      setSeenTerms(ns); persist('wim.terms', JSON.stringify(ns));
    }
  }, [seenTerms, persist]);

  const switchLang = useCallback(() => {
    const next: Lang = loc === 'ko' ? 'en' : loc === 'en' ? 'ja' : 'ko';
    router.replace(`/${next}/wim`);
  }, [loc, router]);

  const weekLabels = t.weekDays.split(',');

  // ════════════════════════ QUIZ OVERLAY ════════════════════════
  if (activeIdx != null && units[activeIdx]) {
    const u = units[activeIdx];
    const revealed = picked != null;
    const wasCorrect = picked != null && u.correctCategoryIds.includes(picked);
    const isLast = activeIdx >= units.length - 1;
    const allDoneAfter = units.every((x) => x.id === u.id ? true : !!done[x.id]);
    return (
      <div style={{ minHeight: '100vh', background: P.bg, color: P.ink, fontFamily: "-apple-system,'SF Pro Rounded','Hiragino Sans','Apple SD Gothic Neo',sans-serif" }}>
        <style>{`@keyframes wimPop{0%{transform:scale(0.86);opacity:0}70%{transform:scale(1.04)}100%{transform:scale(1);opacity:1}} @keyframes wimUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 18px calc(40px + env(safe-area-inset-bottom))' }}>
          {/* top bar: close + progress + countdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
            <button type="button" onClick={() => closeQuiz(false)} aria-label={t.backHome} style={{ font: 'inherit', width: 38, height: 38, borderRadius: '50%', border: `1.5px solid ${P.line}`, background: '#fff', fontSize: 16, fontWeight: 900, color: P.ink, cursor: 'pointer' }}>←</button>
            <div style={{ flex: 1, height: 8, background: P.heroSoft, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ width: `${((activeIdx + (revealed ? 1 : 0.4)) / units.length) * 100}%`, height: '100%', background: P.hero, borderRadius: 99, transition: 'width 0.4s ease' }} />
            </div>
            {everPlayed && !revealed ? (
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: remain <= 3 ? P.coralSoft : P.heroSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: remain <= 3 ? P.coral : P.hero }}>
                {remain}
              </div>
            ) : <div style={{ width: 38 }} />}
          </div>

          {!everPlayed && !revealed && (
            <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, fontWeight: 800, color: P.hero, background: P.heroSoft, borderRadius: 99, padding: '7px 12px' }}>🔍 {t.warmup}</div>
          )}

          {/* mover card — NO direction arrows/colors (compliance): magnitude only */}
          <div style={{ marginTop: 16, background: '#fff', borderRadius: 24, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '20px 18px', textAlign: 'center', animation: 'wimUp 0.35s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
              <TickerLogo ticker={u.ticker} size={34} />
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.01em' }}>{u.ticker}</div>
                {u.companyName && <div style={{ fontSize: 11, fontWeight: 650, color: P.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>{u.companyName}</div>}
              </div>
            </div>
            <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: P.heroSoft, color: P.heroDeep, borderRadius: 99, padding: '6px 13px', fontSize: 12.5, fontWeight: 900 }}>
              ±{u.moveMagnitude}% · {t.moved}
            </div>
            <h1 style={{ margin: '13px 0 2px', fontSize: 21, fontWeight: 900, letterSpacing: '-0.02em' }}>{u.prompt[loc]}</h1>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: P.sub }}>{t.whatHappened}</div>
          </div>

          {/* choices — full-width vertical stack (CJK-safe), 3D press */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {u.choices.map((c) => {
              const isPick = picked === c.categoryId;
              const isAnswer = u.correctCategoryIds.includes(c.categoryId);
              const bg = !revealed ? '#fff' : isAnswer ? P.mintSoft : isPick ? P.coralSoft : '#fff';
              const border = !revealed ? P.line : isAnswer ? P.mint : isPick ? P.coral : P.line;
              return (
                <button
                  key={c.id} type="button" disabled={revealed}
                  onClick={() => answer(u, c.categoryId)}
                  style={{
                    font: 'inherit', textAlign: 'left', cursor: revealed ? 'default' : 'pointer',
                    background: bg, border: `2px solid ${border}`, borderRadius: 18,
                    padding: '14px 15px', fontSize: 14, fontWeight: 750 as any, color: P.ink, lineHeight: 1.4,
                    boxShadow: revealed ? 'none' : '0 3px 0 rgba(76,63,175,0.12)',
                    transition: 'transform 0.08s ease, box-shadow 0.08s ease',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                  onTouchStart={(e) => { if (!revealed) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(2px)'; }}
                  onTouchEnd={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
                >
                  <span style={{ flex: 1 }}>{c.label[loc]}</span>
                  {revealed && isAnswer && <span style={{ fontSize: 18 }}>✅</span>}
                  {revealed && isPick && !isAnswer && <span style={{ fontSize: 18 }}>🤔</span>}
                </button>
              );
            })}
          </div>

          {/* reveal */}
          {revealed && (
            <div style={{ animation: 'wimPop 0.4s cubic-bezier(0.22,1,0.36,1)' }}>
              <div style={{ marginTop: 16, textAlign: 'center', fontSize: 20, fontWeight: 900, color: wasCorrect ? P.mint : P.coral }}>
                {wasCorrect ? `🎉 ${t.correct} +${XP_CORRECT}XP` : `💪 ${t.notQuite} +${XP_TRIED}XP`}
              </div>

              <div style={{ marginTop: 12, background: '#fff', borderRadius: 20, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '15px 16px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em', color: P.hero, marginBottom: 7 }}>{t.theWhy.toUpperCase()}</div>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, fontWeight: 600 as any }}><Bold text={u.explanation[loc]} /></p>
                {u.evidence?.newsHeadline && (
                  <div style={{ marginTop: 11, display: 'flex', gap: 7, alignItems: 'flex-start', background: P.bg, borderRadius: 12, padding: '9px 11px' }}>
                    <span style={{ fontSize: 13 }}>🧾</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '0.08em', color: P.faint }}>{t.receipt.toUpperCase()}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: P.sub, lineHeight: 1.45 }}>{u.evidence.newsHeadline[loc]}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* ③ institutional deep layer — rewarded-ad gate when live; free (labeled) now */}
              {(u.deepRead || u.money) && (
                <div style={{ marginTop: 12, background: `linear-gradient(135deg, ${P.heroDeep}, ${P.hero})`, borderRadius: 20, padding: '15px 16px', color: '#fff', boxShadow: P.shadow }}>
                  <button type="button" onClick={() => setDeepOpen(!deepOpen)} style={{ font: 'inherit', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 17 }}>🏛️</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 900 }}>{t.deepTitle}</span>
                      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 650, opacity: 0.8, marginTop: 1 }}>{t.deepSub}</span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 900, transform: deepOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                  </button>
                  {!deepOpen && (
                    <div style={{ marginTop: 9, fontSize: 10.5, fontWeight: 800, opacity: 0.85 }}>
                      {WIM_ADS_LIVE ? `▶ ${t.deepLocked}` : `✨ ${t.deepFree}`}
                    </div>
                  )}
                  {deepOpen && (
                    <div style={{ marginTop: 11, animation: 'wimUp 0.3s ease' }}>
                      {u.deepRead && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, fontWeight: 600 as any, opacity: 0.96 }}>{u.deepRead[loc]}</p>}
                      {u.money && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                          {u.money.darkPoolPct != null && (
                            <button type="button" onClick={() => markTerm('darkPool')} style={{ font: 'inherit', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.16)', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                              {t.dp} {Math.round(u.money.darkPoolPct)}% ⓘ
                            </button>
                          )}
                          {u.money.volumePcr != null && (
                            <button type="button" onClick={() => markTerm('pcr')} style={{ font: 'inherit', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.16)', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                              {t.pcr} {u.money.volumePcr.toFixed(2)} ⓘ
                            </button>
                          )}
                          {u.money.squeezeScore != null && (
                            <button type="button" onClick={() => markTerm('squeeze')} style={{ font: 'inherit', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.16)', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                              {t.squeeze} {Math.round(u.money.squeezeScore)} ⓘ
                            </button>
                          )}
                          {u.money.maxPain != null && (
                            <button type="button" onClick={() => markTerm('maxPain')} style={{ font: 'inherit', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.16)', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 800 }}>
                              {t.maxPain} ${u.money.maxPain} ⓘ
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => { if (isLast || allDoneAfter) closeQuiz(true); else startQuiz(activeIdx + 1); }}
                style={{ font: 'inherit', width: '100%', marginTop: 15, background: P.ink, color: '#fff', border: 'none', borderRadius: 18, padding: '15px 0', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 0 rgba(38,34,64,0.35)' }}
              >
                {isLast || allDoneAfter ? `🏁 ${t.finish}` : `${t.next} →`}
              </button>
            </div>
          )}

          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 10, color: P.faint, fontWeight: 600, lineHeight: 1.5 }}>{u.disclaimer[loc]}</div>
        </div>

        {/* glossary bottom sheet (shared with home) */}
        {glossOpen && (
          <div onClick={() => setGlossOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(38,34,64,0.45)', display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: '#fff', borderRadius: '22px 22px 0 0', padding: '20px 20px calc(24px + env(safe-area-inset-bottom))', animation: 'wimUp 0.25s ease' }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: P.ink }}>{METRIC_GLOSSARY[glossOpen].title[loc]}</div>
              <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.7, color: P.sub, fontWeight: 600 as any }}>{METRIC_GLOSSARY[glossOpen].body[loc]}</p>
              <button type="button" onClick={() => setGlossOpen(null)} style={{ font: 'inherit', width: '100%', marginTop: 14, background: P.heroSoft, color: P.heroDeep, border: 'none', borderRadius: 14, padding: '12px 0', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>{t.close}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════ HOME ════════════════════════
  return (
    <div style={{ minHeight: '100vh', background: P.bg, color: P.ink, fontFamily: "-apple-system,'SF Pro Rounded','Hiragino Sans','Apple SD Gothic Neo',sans-serif" }}>
      <style>{`@keyframes wimUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}} .wim-skel{background:linear-gradient(90deg,#EFEBFF 25%,#F8F6FF 50%,#EFEBFF 75%);background-size:200% 100%;animation:wimSh 1.4s infinite} @keyframes wimSh{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: `0 18px calc(${WIM_ADS_LIVE ? 96 : 44}px + env(safe-area-inset-bottom))` }}>

        {/* masthead — violet hero */}
        <header style={{ margin: '0 -18px', padding: '0 18px', background: `linear-gradient(160deg, ${P.hero}, ${P.heroDeep})`, borderRadius: '0 0 30px 30px', color: '#fff', paddingTop: 'calc(18px + env(safe-area-inset-top))', paddingBottom: 22, boxShadow: P.shadow }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 40, height: 40, borderRadius: 14, background: 'rgba(255,255,255,0.16)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 21 }}>🔍</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.05 }}>Why&apos;d It Move?</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.75, marginTop: 2 }}>{t.tagline}</div>
            </div>
            <button type="button" onClick={switchLang} style={{ font: 'inherit', marginLeft: 'auto', flexShrink: 0, background: 'rgba(255,255,255,0.16)', color: '#fff', border: 'none', borderRadius: 99, padding: '7px 13px', fontSize: 11.5, fontWeight: 900, cursor: 'pointer' }}>
              🌐 {t.langBtn}
            </button>
          </div>

          {/* Calm-style streak ring + week dots */}
          <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.10)', borderRadius: 20, padding: '14px 15px' }}>
            <StreakRing days={streakDays} t={t} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              {weekLabels.map((d, i) => {
                const on = week[i]; const isToday = i === weekdayIdx();
                return (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: on ? '#fff' : 'rgba(255,255,255,0.14)',
                      border: isToday && !on ? '2px solid rgba(255,255,255,0.7)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 900, color: on ? P.hero : 'rgba(255,255,255,0.7)',
                    }}>{on ? '✓' : ''}</div>
                    <div style={{ fontSize: 9, fontWeight: 800, opacity: 0.75, marginTop: 4 }}>{d}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </header>

        {/* XP / level (7REWARDS-style) */}
        <section style={{ marginTop: 14, background: '#fff', borderRadius: 20, border: `1.5px solid ${P.line}`, boxShadow: P.shadow, padding: '13px 16px', animation: 'wimUp 0.3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 900 }}>🕵️ {levelNames[levelIdx]}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: P.faint }}>{t.level} {levelIdx + 1}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 900, color: P.hero }}>{xp} {t.xp}</span>
          </div>
          <div style={{ marginTop: 9, height: 10, background: P.heroSoft, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${levelPct * 100}%`, height: '100%', background: `linear-gradient(90deg, ${P.amber}, ${P.coral})`, borderRadius: 99, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ marginTop: 6, fontSize: 10.5, fontWeight: 700, color: P.faint }}>
            {XP_PER_LEVEL - (xp % XP_PER_LEVEL)} {t.xp} {t.toNext}
          </div>
        </section>

        {/* TODAY'S SET */}
        <section style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, letterSpacing: '-0.01em' }}>⚡ {t.todaysSet}</h2>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: doneCount === units.length && units.length > 0 ? P.mint : P.faint }}>
              {doneCount}/{units.length || '–'} {t.done}
            </span>
          </div>

          {!today && !failed && (
            <div>
              <div className="wim-skel" style={{ height: 76, borderRadius: 20, marginTop: 12 }} />
              <div className="wim-skel" style={{ height: 76, borderRadius: 20, marginTop: 10 }} />
              <div className="wim-skel" style={{ height: 76, borderRadius: 20, marginTop: 10 }} />
            </div>
          )}
          {failed && !today && (
            <div style={{ marginTop: 12, background: '#fff', borderRadius: 20, border: `1.5px solid ${P.line}`, padding: '18px 16px', fontSize: 13, fontWeight: 700, color: P.sub, textAlign: 'center' }}>{t.empty}</div>
          )}

          {units.map((u, i) => {
            const isDone = !!done[u.id];
            const lvLabel = u.difficultyLevel === 1 ? t.quizLv1 : u.difficultyLevel === 2 ? t.quizLv2 : t.quizLv3;
            const lvColor = u.difficultyLevel === 1 ? P.mint : u.difficultyLevel === 2 ? P.amber : P.hero;
            return (
              <button
                key={u.id} type="button" onClick={() => startQuiz(i)}
                style={{
                  font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%',
                  marginTop: i === 0 ? 12 : 10, background: '#fff', borderRadius: 20,
                  border: `1.5px solid ${isDone ? P.mintSoft : P.line}`, boxShadow: P.shadow,
                  padding: '14px 15px', display: 'flex', alignItems: 'center', gap: 12,
                  opacity: 1, animation: 'wimUp 0.3s ease',
                }}
              >
                <TickerLogo ticker={u.ticker} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 900 }}>{u.ticker}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 900, color: lvColor, background: `${lvColor}1A`, borderRadius: 99, padding: '2px 8px' }}>{lvLabel}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: P.sub, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ±{u.moveMagnitude}% · {u.prompt[loc]}
                  </div>
                </div>
                <span style={{
                  flexShrink: 0, fontSize: 11.5, fontWeight: 900, borderRadius: 99, padding: '7px 13px',
                  background: isDone ? P.mintSoft : P.hero, color: isDone ? P.mint : '#fff',
                }}>{isDone ? `✓ ${t.replay}` : `▶ ${t.play}`}</span>
              </button>
            );
          })}

          {setDoneShown && doneCount === units.length && units.length > 0 && (
            <div style={{ marginTop: 12, background: P.mintSoft, border: `1.5px solid ${P.mint}`, borderRadius: 20, padding: '15px 16px', textAlign: 'center', animation: 'wimUp 0.35s ease' }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: P.mint }}>🏆 {t.setDone}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: P.sub, marginTop: 4 }}>{t.setDoneSub}</div>
            </div>
          )}
        </section>

        {/* CURRICULUM — Kahoot-style shelves, basics → institutional */}
        <section style={{ marginTop: 24 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, letterSpacing: '-0.01em' }}>📚 {t.curriculum}</h2>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: P.faint, marginTop: 3 }}>{t.curriculumSub}</div>
          {([1, 2, 3] as const).map((depth) => {
            const terms = DEPTH_TERMS[depth];
            const label = depth === 1 ? t.depth1 : depth === 2 ? t.depth2 : t.depth3;
            const color = depth === 1 ? P.mint : depth === 2 ? P.amber : P.hero;
            const learned = terms.filter((x) => seenTerms[x]).length;
            return (
              <div key={depth} style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 900, color }}>{'●'.repeat(depth)} {label}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: P.faint }}>{learned}/{terms.length} {t.learned}</span>
                </div>
                <div style={{ display: 'flex', gap: 9, overflowX: 'auto', margin: '8px -18px 0', padding: '2px 18px 6px', WebkitOverflowScrolling: 'touch' }}>
                  {terms.map((term) => {
                    const seen = !!seenTerms[term];
                    return (
                      <button
                        key={term} type="button" onClick={() => markTerm(term)}
                        style={{
                          font: 'inherit', textAlign: 'left', cursor: 'pointer', flex: '0 0 138px',
                          background: '#fff', borderRadius: 16, border: `1.5px solid ${seen ? `${color}55` : P.line}`,
                          boxShadow: P.shadow, padding: '12px 12px',
                        }}
                      >
                        <div style={{ fontSize: 17 }}>{seen ? '✅' : depth === 1 ? '🌱' : depth === 2 ? '🔬' : '🏛️'}</div>
                        <div style={{ marginTop: 7, fontSize: 12, fontWeight: 850 as any, lineHeight: 1.3, color: P.ink, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {METRIC_GLOSSARY[term].title[loc]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {/* footer: disclaimer */}
        <footer style={{ marginTop: 26, textAlign: 'center', fontSize: 10, color: P.faint, fontWeight: 600, lineHeight: 1.6 }}>
          {units[0]?.disclaimer?.[loc] || (loc === 'ko' ? '교육용 시장 정보입니다. 투자 조언이 아니며 정확성을 보장하지 않습니다.' : loc === 'ja' ? '教育目的の市場情報です。投資助言ではなく、正確性は保証されません。' : 'Educational market information only. Not investment advice; accuracy not guaranteed.')}
          <div style={{ marginTop: 4, opacity: 0.8 }}>Why&apos;d It Move? · prototype · by SIGNUM HQ</div>
        </footer>
      </div>

      {/* ① bottom banner ad slot — inert until WIM_ADS_LIVE */}
      {WIM_ADS_LIVE && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 'calc(62px + env(safe-area-inset-bottom))', background: '#fff', borderTop: `1.5px solid ${P.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: P.faint, zIndex: 50 }}>
          {t.adBanner}
        </div>
      )}

      {/* glossary bottom sheet */}
      {glossOpen && (
        <div onClick={() => setGlossOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(38,34,64,0.45)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: '#fff', borderRadius: '22px 22px 0 0', padding: '20px 20px calc(24px + env(safe-area-inset-bottom))', animation: 'wimUp 0.25s ease' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: P.ink }}>{METRIC_GLOSSARY[glossOpen].title[loc]}</div>
            <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.7, color: P.sub, fontWeight: 600 as any }}>{METRIC_GLOSSARY[glossOpen].body[loc]}</p>
            <button type="button" onClick={() => setGlossOpen(null)} style={{ font: 'inherit', width: '100%', marginTop: 14, background: P.heroSoft, color: P.heroDeep, border: 'none', borderRadius: 14, padding: '12px 0', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>{t.close}</button>
          </div>
        </div>
      )}
    </div>
  );
}
