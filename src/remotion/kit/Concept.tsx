/**
 * Concept — 개념 설명 트랙
 * ---------------------------------------------------------------------------
 * 1080x1920 · 30fps · 나레이션 실측에 컷을 묶는다
 *
 * ★ 이 파일의 모든 수치·레이아웃은 «레퍼런스 9편 실측»에서 나왔다.
 *   .agent/REF_FLEET.json  (scripts/ref-fleet.mjs 로 재생성 가능)
 *
 *   계급 1  마스코트 애니   Primate Economics  1,500만 / 90만 / 67.5만
 *           → 흰 배경(밝기 217~235) · 자막 «없음» · 개념을 «연기»한다
 *   계급 2  차트 위 강의    ICT Gems           17.6만 / 10.5만 / 6.2만
 *           → 실제 캔들차트 화면녹화 · 밝기 197~201 · 컷 0 · 커서로 짚는다
 *   계급 3  토킹헤드+그래픽 The Plain Bagel    36.5만
 *           DayTrade Warrior   2.2만 / 1.5만
 *           → 상단 고정 타이틀 필 · 자막 «화면 76~80%» · 키워드 색박스
 *
 * ⛔ 실측으로 확정된 격차 (우리 v2 → 이 파일에서 고친 것)
 *   자막 위치   86~91%  →  72~78%   (쇼츠 하단 UI 를 침범하고 있었다)
 *   자막 단어수 11.3    →  5~7      (레퍼런스 9편 전부 5.8~7.8)
 *   밝기        96.6    →  ≥130     (상위 3계급 전부 197 이상)
 *   장면 전환   0회     →  5회      (Primate 19.5~22.8컷/분, ICT 0컷/분 — 혼재하나 0은 최하)
 *   화면 텍스트 19.3%   →  ↑        (플릿 최하위 tie)
 *
 * ⛔ 개념을 «글자»가 아니라 «그림»으로 (계급 1 차용)
 *   Primate 는 원숭이가 바나나 팻말을 들고 인플레이션을 «연기»한다.
 *   우리 재료로 같은 것을 하면 → 실제 스트라이크별 미결제약정 사다리다.
 *   $450 에 11,991 계약이 실제로 쌓여 있다. 그림이 곧 데이터다.
 *
 * ⛔ 숫자는 전부 실데이터. 하나도 지어내지 않는다.
 *   OI      /api/live/options/atm?t=AMD  (2026-08-20 수집, 8/21 만기)
 *   종가    앱 헤더 실캡처 $466.42 (-3.71%)
 *   맥스페인 앱 타일 실캡처 $450 · gap +3.65%   ← 전 체인 계산은 앱이 한다
 *   ⚠ API 는 ATM ±8 스트라이크만 준다. 그 «잘린 체인»으로 맥스페인을 재계산하면
 *     $475 가 나온다 — 그래서 사다리는 «계약이 어디에 쌓였나»만 보여주고
 *     맥스페인 값은 앱(전 체인)의 $450 을 쓴다. 둘은 모순되지 않는다:
 *     실제로 가장 높은 막대가 $450 이다.
 */

import React from 'react';
import {
  AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence,
  interpolate, useCurrentFrame, Easing, staticFile,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';
import { VOICE_AD } from './voice-ad';

const { fontFamily } = loadFont();
export const CONCEPT_FPS = 30;
const F = (s: number) => Math.round(s * CONCEPT_FPS);
const W = 1080, H = 1920;

const C = {
  ink: '#08101C', accent: '#FFC24D', cyan: '#8FE4F4', green: '#66DFB2',
  red: '#FF98A6', text: '#F7FAFE', dim: 'rgba(224,238,254,0.72)',
};
const seg = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const ease = Easing.bezier(0.22, 1, 0.36, 1);

// ── 타임라인 ────────────────────────────────────────────────────────────────
const V = Object.fromEntries(VOICE_AD.lines.map((l) => [l.id, l]));
const ORDER = [
  'cp1a', 'cp1b',                       // 훅      — 계약이 만기에 사라진다
  'cp1f', 'cp1g', 'cp1h', 'cp1c',       // 사다리  — 실제 OI 가 어디 쌓였나
  'cp1i', 'cp1j', 'cp1k',               // 차트    — 딜러 헤지 · 논쟁
  'cp1d', 'cp1l',                       // 차트    — 경계
  'cp1m', 'cp1n', 'cp1o', 'cp1p',       // 활용    — 붐비는 쪽
  'cp1e',                               // 페이오프 — 앱
] as const;
const GAP = F(0.16);
const CUTS: { id: string; from: number; len: number }[] = [];
{
  let t = 0;
  for (const id of ORDER) {
    const len = F(V[id].sec) + GAP;
    CUTS.push({ id, from: t, len });
    t += len;
  }
}
const at = (id: string) => CUTS.find((c) => c.id === id)!;
const PAYOFF = at('cp1e').from;
const CTA_FROM = at('cp1e').from + at('cp1e').len;
const CTA_LEN = F(4.4);   // 끝 장면이 스쳐 지나가지 않게 (2026-08-21)
export const CONCEPT_DURATION = CTA_FROM + CTA_LEN;

// 장면 — 실제 화면이 «바뀐다». v2 는 컷이 0회였다 (플릿 최하위)
type Scene = 'hook' | 'hook2' | 'ladder' | 'ladderZoom' | 'chart' | 'chartZoom' | 'zones' | 'zonesDn' | 'payoff';
// ⛔ 첫 컷 ≤ 2.8초 — 우리 채널 전수에서 «첫컷 시각 ↔ 지속률 -0.90» 은 유일하게
//    살아남은 신호다. cp1b(1.6초)에서 훅 안을 한 번 자른다.
const SCENE_AT: [string, Scene][] = [
  ['cp1a', 'hook'], ['cp1b', 'hook2'], ['cp1f', 'ladder'], ['cp1h', 'ladderZoom'], ['cp1i', 'chart'],
  ['cp1k', 'chartZoom'], ['cp1m', 'zones'], ['cp1o', 'zonesDn'], ['cp1e', 'payoff'],
];
const sceneOf = (f: number): Scene => {
  let s: Scene = 'hook';
  for (const [id, sc] of SCENE_AT) if (f >= at(id).from) s = sc;
  return s;
};
const SCENE_STARTS = SCENE_AT.map(([id]) => at(id).from);

// ── 실데이터 ────────────────────────────────────────────────────────────────
const SERIES = [223.5, 214.4, 204.7, 207.7, 223.6, 231.8, 249.8, 259.7, 252.0, 252.2, 246.3, 200.2, 208.4, 213.6, 205.9, 203.1, 203.4, 196.6, 210.9, 200.2, 190.9, 199.4, 202.7, 204.8, 193.4, 196.3, 205.3, 202.7, 220.3, 202.0, 203.4, 217.5, 221.5, 236.6, 246.8, 258.1, 278.4, 284.5, 305.3, 334.6, 337.1, 360.5, 355.3, 408.5, 458.8, 445.5, 424.1, 414.0, 449.6, 503.9, 518.1, 510.1, 542.5, 466.4, 475.5, 488.5, 547.3, 512.5, 551.6, 519.7, 521.6, 580.9, 517.8, 484.4, 466.42];
const MAXPAIN = 450, NOW = 466.42, GAP_PCT = 3.65, GAP_ABS = 16.42;

// 스트라이크별 미결제약정 — /api/live/options/atm?t=AMD · 만기 2026-08-21
const OI: [number, number, number][] = [   // [strike, callOI, putOI]
  [450, 4327, 7664], [452.5, 19, 1037], [455, 192, 1715], [457.5, 40, 531],
  [460, 1354, 5025], [462.5, 46, 740], [465, 419, 1700], [467.5, 308, 450],
  [470, 1007, 3016], [472.5, 181, 1657], [475, 1674, 2309], [477.5, 243, 874],
  [480, 4451, 3629], [482.5, 382, 735], [485, 974, 1162], [487.5, 433, 348],
  [490, 4049, 2575],
];
const OI_MAX = Math.max(...OI.map(([, c, p]) => c + p));

const CH = { x: 96, y: 560, w: W - 192, h: 560 };
const P_MIN = 170, P_MAX = 610;
const yOf = (p: number) => CH.y + CH.h - ((p - P_MIN) / (P_MAX - P_MIN)) * CH.h;
const xOf = (i: number) => CH.x + (i / (SERIES.length - 1)) * CH.w;
// 클로즈업 컷용 축 — 레벨과 종가만 담는다
const Z_MIN = 400, Z_MAX = 620;
const zyOf = (p: number) => CH.y + CH.h - ((p - Z_MIN) / (Z_MAX - Z_MIN)) * CH.h;

// ── 자막 — DayTrade Warrior 차용 ────────────────────────────────────────────
// 실측: 레퍼런스 9편 전부 «큐당 5.8~7.8단어». 우리 v2 는 11.3단어(최장 19단어)라
//       한 컷이 3줄이 되어 읽히지 않았다. 한 낭독을 2~3청크로 쪼개 순차로 띄운다.
//       위치도 76~80%(DTW 실사 확인) 에 맞춘다 — v2 는 86~91% 로 쇼츠 UI 를 침범했다.
type Chunk = { t: string; hi?: string };
const CHUNKS: Record<string, Chunk[]> = {
  cp1a: [{ t: 'Most options expire worthless.', hi: 'worthless' }],
  cp1b: [{ t: 'And there is one price' }, { t: 'where the most of them do.' }],
  cp1f: [{ t: 'Every open contract sits at a strike price.', hi: 'strike price' }],
  cp1g: [{ t: 'Add up what all of them' }, { t: 'would pay out at expiry,' },
         { t: 'and one price makes that total the smallest.', hi: 'smallest' }],
  cp1h: [{ t: 'That is max pain.', hi: 'max pain' },
         { t: 'The level where option buyers get the least back.' }],
  cp1c: [{ t: 'That price is called max pain.', hi: 'max pain' }],
  cp1i: [{ t: 'The dealers who sold those options' },
         { t: 'hedge around it — that is real buying.' }],
  cp1j: [{ t: 'Whether that pulls price toward it is debated.', hi: 'debated' }],
  cp1k: [{ t: 'What is not debated is where the contracts sit.' }],
  cp1d: [{ t: 'It is not a prediction.', hi: 'not' }, { t: 'Just where the contracts are stacked.' }],
  cp1l: [{ t: 'It moves as contracts open and close.' }, { t: 'It is a level, not a target.', hi: 'not a target' }],
  cp1m: [{ t: 'So how do you actually use it?' }],
  cp1n: [{ t: 'When price sits above max pain,' }, { t: 'the crowded side is calls.', hi: 'calls' }],
  cp1o: [{ t: 'When it sits below, the crowd leans short.', hi: 'short' }],
  cp1p: [{ t: 'It tells you where the crowd is.' }, { t: 'Not where price goes.', hi: 'Not' }],
  cp1e: [{ t: 'On AMD right now, that price is $450.', hi: '$450' }],
};

const Caption: React.FC<{ id: string; len: number }> = ({ id, len }) => {
  const f = useCurrentFrame();
  const cs = CHUNKS[id];
  const speak = len - GAP;
  const w = cs.map((c) => c.t.length);
  const tot = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  const spans = cs.map((c, i) => { const a = acc; acc += (w[i] / tot) * speak; return { c, a, b: acc }; });
  const cur = spans.find((s) => f >= s.a && f < s.b) || spans[spans.length - 1];
  const local = f - cur.a;
  const o = Math.min(seg(local, -2, 1), 1 - seg(f, len - 4, len));
  const y = interpolate(seg(local, 0, 7), [0, 1], [12, 0], { easing: ease });
  const parts = cur.c.hi
    ? cur.c.t.split(new RegExp(`(${cur.c.hi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i'))
    : [cur.c.t];
  return (
    <div style={{
      position: 'absolute', left: 60, right: 60, top: 1382,      // 72% — DTW 76~80% 밴드 상단
      display: 'flex', justifyContent: 'center', opacity: o, transform: `translateY(${y}px)`,
    }}>
      <div style={{
        background: 'rgba(6,11,20,0.93)', borderRadius: 16, padding: '15px 26px',
        fontFamily, fontSize: 45, lineHeight: 1.16, fontWeight: 900, color: '#fff',
        textAlign: 'center', letterSpacing: '-0.02em', border: '2px solid rgba(255,255,255,0.14)',
        boxShadow: '0 14px 40px rgba(0,0,0,0.5)', maxWidth: 900,
      }}>
        {parts.map((p, i) =>
          cur.c.hi && p.toLowerCase() === cur.c.hi.toLowerCase()
            ? <span key={i} style={{
                background: C.accent, color: C.ink, borderRadius: 8, padding: '2px 10px',
                margin: '0 2px', display: 'inline-block',
              }}>{p}</span>
            : <span key={i}>{p}</span>)}
      </div>
    </div>
  );
};

// ── 배경 ────────────────────────────────────────────────────────────────────
// 실측: 상위 3계급이 전부 밝기 197 이상. 우리 v2 는 96.6 이었다.
//       브랜드가 다크블루라 흰 배경으로 가지는 않되, 중간톤 상단까지 끌어올린다.
const Bg: React.FC = () => {
  const f = useCurrentFrame();
  const drift = interpolate(f, [0, CONCEPT_DURATION], [0, -46]);
  return (
    <AbsoluteFill style={{ background: '#22375A' }}>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg,#93B0D8 0%,#6E90BF 44%,#51739E 100%)' }} />
      <div style={{ position: 'absolute', inset: -60, transform: `translateX(${drift}px)` }}>
        <Loop durationInFrames={600}>
          <OffthreadVideo src={staticFile('ad/plate-p1.mp4')} muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.34,
              filter: 'brightness(1.5) saturate(0.5)' }} />
        </Loop>
      </div>
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse 112% 78% at 50% 46%, rgba(214,234,255,0.4) 0%, rgba(150,190,236,0.2) 58%, rgba(52,80,120,0.1) 100%)',
      }} />
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, rgba(6,11,20,0.72) 0%, rgba(6,11,20,0.16) 17%, rgba(6,11,20,0) 30%)',
      }} />
    </AbsoluteFill>
  );
};

const Count: React.FC<{ to: number; from: number; dur: number; prefix?: string; suffix?: string; digits?: number }> =
  ({ to, from, dur, prefix = '', suffix = '', digits = 0 }) => {
    const f = useCurrentFrame();
    const v = interpolate(f, [from, from + dur], [0, to],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    return <>{prefix}{v.toFixed(digits)}{suffix}</>;
  };

/**
 * Enter — 장면 «컷».
 * ⛔ 9프레임 디졸브로 만들었더니 프레임간 차가 흩어져 컷 검출이 0.0/분이 나왔다(실측).
 *    2프레임 안에 갈아끼우고 흰 플래시를 얹어야 «컷»으로 읽힌다.
 */
const Enter: React.FC<{ at: number; children: React.ReactNode }> = ({ at: a, children }) => {
  const f = useCurrentFrame();
  const p = seg(f, a - 2, a);
  return (
    <AbsoluteFill style={{ opacity: p, transform: `scale(${0.99 + p * 0.01})` }}>
      {children}
    </AbsoluteFill>
  );
};

/** 컷 플래시 — 장면이 바뀌는 순간을 눈이 «센다» */
const Flash: React.FC<{ at: number }> = ({ at: a }) => {
  const f = useCurrentFrame();
  const o = f >= a - 1 && f < a + 4 ? 0.4 * (1 - (f - a + 1) / 5) : 0;
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: '#EAF3FF', opacity: o }} />;
};

// ── 장면 1 · 훅 — 계약이 만기에 «휴지»가 된다 ──────────────────────────────
// Primate 차용: 개념을 문장이 아니라 «일어나는 일»로 보여준다.
//
// ⛔ 첫 판에서 «100% OF THESE» 라는 카운터를 넣었다 — 사실이 아니다.
//    만기 소멸 비율은 시기·종목마다 다르다. 숫자를 모르면 숫자를 쓰지 않는다.
//    나레이션이 말하는 "most" 만 그림으로 보여준다.
// ⛔ 카드를 날려버렸더니 화면이 텅 비었다(실측 프레임 확인). 날리지 말고
//    «회색으로 죽인다» — 화면은 차 있고, 죽은 것과 산 것의 대비로 개념이 선다.
const SceneHook: React.FC = () => {
  const f = useCurrentFrame();
  const COLS = 6, ROWS = 4, N = COLS * ROWS;
  const bStart = at('cp1b').from;
  const ALIVE = new Set([9, 16, 21]);            // 소수만 살아남는다
  return (
    <AbsoluteFill>
      <div style={{
        position: 'absolute', left: 96, top: 452, fontFamily, fontSize: 26, fontWeight: 900,
        color: C.text, letterSpacing: '0.13em', textShadow: '0 2px 10px rgba(0,0,0,0.8)',
      }}>OPTION CONTRACTS  ·  AT EXPIRY</div>

      {Array.from({ length: N }).map((_, i) => {
        const col = i % COLS, row = Math.floor(i / COLS);
        const rnd = Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
        const alive = ALIVE.has(i);
        const die = alive ? 0 : seg(f, 24 + rnd * 40, 46 + rnd * 40);
        const born = seg(f, 2 + i * 1.1, 12 + i * 1.1);
        const x = 96 + col * 148, y = 500 + row * 122;
        // cp1b — 살아남은 계약이 «한 가격»으로 모인다
        const pull = seg(f, bStart + 6, bStart + 30);
        const slot = [...ALIVE].indexOf(i);
        const tx = alive ? (W / 2 - 210 + slot * 146 - x) * pull : 0;
        const ty = alive ? (996 - y) * pull : 0;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: 128, height: 100, borderRadius: 12,
            background: alive ? 'rgba(102,223,178,0.4)' : `rgba(8,16,30,${0.5 - die * 0.3})`,
            border: `2px solid ${alive ? C.green : `rgba(232,244,255,${0.6 - die * 0.44})`}`,
            transform: `translate(${tx}px, ${ty}px) scale(${(1 - die * 0.14) * (alive ? 1 + pull * 0.12 : 1)})`,
            opacity: born, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily, fontSize: 22, fontWeight: 900, letterSpacing: '0.04em',
            color: alive ? '#EAFFF7' : `rgba(244,250,255,${0.95 - die * 0.7})`,
            textDecoration: die > 0.6 ? 'line-through' : 'none',
            boxShadow: alive ? `0 0 26px rgba(102,223,178,0.5)` : 'none',
          }}>{i % 2 ? 'CALL' : 'PUT'}</div>
        );
      })}

      <div style={{
        position: 'absolute', left: 96, right: 96, top: 1042, textAlign: 'center', fontFamily,
        fontSize: 40, fontWeight: 900, color: 'rgba(236,246,255,0.68)', letterSpacing: '0.04em',
        opacity: seg(f, 50, 66) * (1 - seg(f, bStart, bStart + 10)),
      }}>MOST OF THESE END WORTHLESS</div>

      {/* cp1b — 한 가격. 아직 이름은 붙이지 않는다 */}
      <div style={{
        position: 'absolute', left: 96, right: 96, top: 1108, height: 5,
        background: C.accent, boxShadow: `0 0 24px ${C.accent}`,
        opacity: seg(f, bStart + 10, bStart + 26),
        transform: `scaleX(${seg(f, bStart + 10, bStart + 34)})`,
      }} />
      <div style={{
        position: 'absolute', left: 96, right: 96, top: 1132, textAlign: 'center', fontFamily,
        fontSize: 38, fontWeight: 900, color: C.accent, letterSpacing: '0.1em',
        opacity: seg(f, bStart + 20, bStart + 34),
      }}>ONE PRICE</div>
    </AbsoluteFill>
  );
};

// ── 장면 2 · 미결제약정 사다리 (실데이터) ───────────────────────────────────
const LAD = { x: 96, y: 640, w: W - 192, h: 500 };
const SceneLadder: React.FC<{ zoom?: boolean }> = ({ zoom }) => {
  const f = useCurrentFrame();
  const a0 = at('cp1f').from;
  const SET = zoom ? OI.filter(([k]) => k <= 470) : OI;
  const bw = LAD.w / SET.length;
  const scan = seg(f, at('cp1g').from, at('cp1g').from + 70);
  const hit = seg(f, at('cp1h').from, at('cp1h').from + 16);
  return (
    <AbsoluteFill>
      {/* 밝은 패널 — 밝기 실측을 끌어올리는 주역이자 계급2(흰 차트) 차용 */}
      <div style={{
        position: 'absolute', left: LAD.x - 26, top: LAD.y - 96, width: LAD.w + 52, height: LAD.h + 226,
        borderRadius: 22, background: 'rgba(10,20,36,0.5)', border: '2px solid rgba(226,240,255,0.34)',
      }} />
      <div style={{
        position: 'absolute', left: LAD.x, top: LAD.y - 78, fontFamily, fontSize: 26, fontWeight: 900,
        color: C.text, letterSpacing: '0.1em',
      }}>OPEN CONTRACTS BY STRIKE</div>
      <div style={{
        position: 'absolute', left: LAD.x, top: LAD.y - 44, fontFamily, fontSize: 22, fontWeight: 700,
        color: C.dim, letterSpacing: '0.04em',
      }}>{zoom ? 'AMD · $450 – $470 · CLOSE UP' : 'AMD · AUG 21 EXPIRY · CALLS + PUTS'}</div>

      {SET.map(([k, c, p], i) => {
        const tot = c + p;
        const grow = zoom ? 1 : seg(f, a0 + 5 + i * 1.2, a0 + 19 + i * 1.2);
        const hC = (c / OI_MAX) * LAD.h * grow, hP = (p / OI_MAX) * LAD.h * grow;
        const x = LAD.x + i * bw;
        const isTop = tot === OI_MAX;
        const lit = zoom ? true : scan > i / SET.length;
        const glow = isTop ? hit : 0;
        return (
          <div key={k}>
            <div style={{
              position: 'absolute', left: x + 4, top: LAD.y + LAD.h - hP, width: bw - 8, height: hP,
              background: lit ? 'rgba(255,107,125,0.92)' : 'rgba(255,107,125,0.5)',
              borderRadius: '3px 3px 0 0',
              boxShadow: glow ? `0 0 26px ${C.accent}` : 'none',
            }} />
            <div style={{
              position: 'absolute', left: x + 4, top: LAD.y + LAD.h - hP - hC, width: bw - 8, height: hC,
              background: lit ? 'rgba(34,214,143,0.92)' : 'rgba(34,214,143,0.5)',
              borderRadius: '4px 4px 0 0',
              boxShadow: glow ? `0 0 26px ${C.accent}` : 'none',
            }} />
            {(zoom || (Number.isInteger(k) && k % 10 === 0)) && (
              <div style={{
                position: 'absolute', left: x - 14, top: LAD.y + LAD.h + 10, width: bw + 28,
                textAlign: 'center', fontFamily, fontSize: zoom ? 24 : 21, fontWeight: 800,
                color: isTop ? C.accent : C.dim, opacity: grow,
              }}>{'$' + k}</div>
            )}
            {/* 클로즈업에서는 막대마다 «실제 계약 수»를 적는다 — 화면 텍스트 밀도가 플릿 최하였다 */}
            {zoom && (
              <div style={{
                position: 'absolute', left: x - 10, top: LAD.y + LAD.h - hP - hC - 34, width: bw + 20,
                textAlign: 'center', fontFamily, fontSize: 20, fontWeight: 900,
                color: isTop ? C.accent : C.text, textShadow: '0 2px 8px rgba(0,0,0,0.9)',
              }}>{(c + p).toLocaleString()}</div>
            )}
          </div>
        );
      })}

      {/* 스캔 라인 — «전부 더한다»를 눈에 보이게 */}
      {!zoom && scan > 0.01 && scan < 0.99 && (
        <div style={{
          position: 'absolute', left: LAD.x + scan * LAD.w, top: LAD.y - 16, width: 4, height: LAD.h + 32,
          background: C.accent, boxShadow: `0 0 22px ${C.accent}`,
        }} />
      )}

      {/* 가장 높은 기둥 = $450. 실제 11,991 계약 */}
      {zoom && hit > 0.02 && (
        <div style={{
          position: 'absolute', right: 96 - 8, top: LAD.y - 88, opacity: hit,
          transform: `translateY(${(1 - hit) * -22}px)`,
          background: C.accent, color: C.ink, borderRadius: 10, padding: '9px 16px',
          fontFamily, fontSize: 28, fontWeight: 900, letterSpacing: '0.02em',
        }}>
          $450 · 11,991 CONTRACTS
        </div>
      )}

      <div style={{
        position: 'absolute', left: LAD.x, top: LAD.y + LAD.h + 52, display: 'flex', gap: 26,
        fontFamily, fontSize: 22, fontWeight: 800, color: C.text, opacity: seg(f, a0 + 20, a0 + 34),
      }}>
        <span><span style={{ color: C.green }}>■</span> CALLS</span>
        <span><span style={{ color: C.red }}>■</span> PUTS</span>
      </div>
    </AbsoluteFill>
  );
};

// ── 장면 3·4 · 차트 (실제 AMD 일봉) ─────────────────────────────────────────
const SceneChart: React.FC<{ zones?: boolean; zoom?: boolean }> = ({ zones, zoom }) => {
  const f = useCurrentFrame();
  const Y = zoom ? zyOf : yOf;
  const TICKS = zoom ? [400, 450, 500, 550, 600] : [200, 300, 400, 500, 600];
  const a0 = at('cp1i').from;
  const draw = zoom ? 1 : seg(f, a0 + 4, a0 + 52);
  const lineOn = zoom ? 1 : seg(f, a0 + 20, a0 + 44);
  const gapOn = seg(f, at('cp1k').from, at('cp1k').from + 20);
  const zUp = zones ? seg(f, at('cp1n').from, at('cp1n').from + 18) : 0;
  const zDn = zones ? seg(f, at('cp1o').from, at('cp1o').from + 16) : 0;

  // 클로즈업은 축이 $400 부터다. 그 아래 구간을 그리면 바닥에 뭉개진다 → 잘라낸다
  const SRC = zoom ? SERIES.slice(43) : SERIES;
  const X = (i: number) => CH.x + (i / (SRC.length - 1)) * CH.w;
  const n = Math.max(2, Math.round(SRC.length * draw));
  const pts = SRC.slice(0, n).map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const lastI = n - 1;
  const pulse = 1 + 0.16 * Math.sin(f / 6);

  return (
    <AbsoluteFill>
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <defs>
          <linearGradient id="cfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.cyan} stopOpacity="0.34" />
            <stop offset="100%" stopColor={C.cyan} stopOpacity="0" />
          </linearGradient>
        </defs>
        {TICKS.map((v) => (
          <g key={v}>
            <line x1={CH.x} y1={Y(v)} x2={CH.x + CH.w} y2={Y(v)} stroke="rgba(232,244,255,0.2)" strokeWidth={1} />
            <text x={CH.x + 8} y={Y(v) - 9} fill="rgba(236,246,255,0.8)"
              fontFamily={fontFamily} fontSize={21} fontWeight={800}>{'$' + v}</text>
          </g>
        ))}
        {zUp > 0.02 && <rect x={CH.x} y={CH.y} width={CH.w} height={Y(MAXPAIN) - CH.y}
          fill={C.green} opacity={0.16 * zUp * (1 - zDn)} />}
        {zDn > 0.02 && <rect x={CH.x} y={Y(MAXPAIN)} width={CH.w} height={CH.y + CH.h - Y(MAXPAIN)}
          fill={C.red} opacity={0.17 * zDn} />}

        <polygon points={`${CH.x},${CH.y + CH.h} ${pts} ${X(lastI)},${CH.y + CH.h}`} fill="url(#cfill)" />
        <polyline points={pts} fill="none" stroke={C.cyan} strokeWidth={5}
          strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 9px ${C.cyan})` }} />
        {n > 2 && <circle cx={X(lastI)} cy={Y(SRC[lastI])} r={10 * pulse} fill="#fff"
          style={{ filter: 'drop-shadow(0 0 16px #fff)' }} />}
        <line x1={CH.x} y1={Y(MAXPAIN)} x2={CH.x + CH.w * lineOn} y2={Y(MAXPAIN)}
          stroke={C.accent} strokeWidth={6} strokeDasharray="14 10"
          style={{ filter: `drop-shadow(0 0 14px ${C.accent})` }} />
        {gapOn > 0.02 && (
          <g opacity={gapOn}>
            <line x1={CH.x + CH.w - 112} y1={Y(NOW)} x2={CH.x + CH.w - 112} y2={Y(MAXPAIN)} stroke={C.green} strokeWidth={4} />
            <line x1={CH.x + CH.w - 136} y1={Y(NOW)} x2={CH.x + CH.w - 88} y2={Y(NOW)} stroke={C.green} strokeWidth={4} />
            <line x1={CH.x + CH.w - 136} y1={Y(MAXPAIN)} x2={CH.x + CH.w - 88} y2={Y(MAXPAIN)} stroke={C.green} strokeWidth={4} />
          </g>
        )}
      </svg>

      <div style={{
        position: 'absolute', left: CH.x, width: CH.w, textAlign: 'right', top: CH.y - 44,
        fontFamily, fontSize: 28, fontWeight: 900, color: C.text, letterSpacing: '0.06em',
      }}>AMD · DAILY</div>

      <div style={{
        position: 'absolute', left: CH.x + 8, top: Y(MAXPAIN) + 12, opacity: lineOn,
        transform: `translateX(${(1 - lineOn) * -26}px)`, display: 'inline-block',
        background: C.accent, color: C.ink, borderRadius: 9, padding: '8px 15px',
        fontFamily, fontSize: 30, fontWeight: 900, letterSpacing: '0.03em',
      }}>MAX PAIN $450</div>

      <div style={{
        position: 'absolute', left: CH.x + CH.w - 300, top: Y(NOW) - 56, opacity: gapOn,
        fontFamily, fontSize: 27, fontWeight: 900, color: '#fff',
        background: 'rgba(8,16,28,0.9)', borderRadius: 9, padding: '7px 14px',
        border: '2px solid rgba(255,255,255,0.46)',
      }}>CLOSE $466</div>

      {gapOn > 0.05 && (
        <div style={{
          position: 'absolute', left: CH.x + CH.w - 330, top: (Y(NOW) + Y(MAXPAIN)) / 2 - 19,
          width: 120, textAlign: 'right', opacity: gapOn, fontFamily, whiteSpace: 'nowrap',
          fontSize: 31, fontWeight: 900, color: C.green, textShadow: '0 2px 16px rgba(0,0,0,0.9)',
        }}><Count to={GAP_ABS} from={at('cp1k').from + 4} dur={24} prefix="+$" /></div>
      )}
    </AbsoluteFill>
  );
};

// ── 정보 패널 ───────────────────────────────────────────────────────────────
type Row = { k: string; label: string; value?: string; count?: [number, number] };
const PHASES: { from: string; to: string; rows: Row[] }[] = [
  { from: 'cp1f', to: 'cp1i', rows: [
    { k: '1', label: 'EVERY CONTRACT SITS AT A STRIKE' },
    { k: '2', label: 'ADD UP EVERY PAYOUT AT EXPIRY' },
    { k: '3', label: 'ONE PRICE MAKES THAT TOTAL SMALLEST' },
  ]},
  { from: 'cp1i', to: 'cp1m', rows: [
    { k: '$', label: 'CLOSE', value: '$466.42' },
    { k: '◆', label: 'MAX PAIN', value: '$450' },
    { k: '↑', label: 'GAP', count: [GAP_ABS, GAP_PCT] },
  ]},
  { from: 'cp1m', to: 'cp1e', rows: [
    { k: '▲', label: 'ABOVE  →  CALLS ARE CROWDED' },
    { k: '▼', label: 'BELOW  →  PUTS ARE CROWDED' },
    { k: '✕', label: 'NOT A PRICE TARGET' },
  ]},
];

const Panel: React.FC = () => {
  const f = useCurrentFrame();
  const ph = PHASES.find((p) => f >= at(p.from).from && f < at(p.to).from);
  if (!ph) return null;
  const t0 = at(ph.from).from;
  const out = 1 - seg(f, at(ph.to).from - 8, at(ph.to).from);
  return (
    <div style={{ position: 'absolute', left: 76, top: 318, right: 76 }}>
      {ph.rows.map((r, i) => {
        const a = seg(f, t0 + 5 + i * 10, t0 + 18 + i * 10) * out;
        return (
          <div key={r.label} style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10,
            opacity: a, transform: `translateX(${(1 - a) * -34}px)`,
          }}>
            <div style={{
              width: 33, height: 33, borderRadius: 7, background: C.accent, color: C.ink,
              fontFamily, fontSize: 20, fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>{r.k}</div>
            <div style={{
              fontFamily, fontSize: 25, fontWeight: 800, color: C.text, letterSpacing: '0.02em',
              textShadow: '0 2px 10px rgba(0,0,0,0.9)', minWidth: r.value || r.count ? 168 : 0,
            }}>{r.label}</div>
            {r.value && <div style={{ fontFamily, fontSize: 27, fontWeight: 900, color: '#fff',
              textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>{r.value}</div>}
            {r.count && (
              <div style={{ fontFamily, fontSize: 27, fontWeight: 900, color: C.green,
                textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
                <Count to={r.count[0]} from={t0 + 18} dur={24} prefix="+$" digits={2} />
                <span style={{ opacity: 0.72 }}>{'  ·  '}</span>
                <Count to={r.count[1]} from={t0 + 18} dur={24} digits={2} suffix="%" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── 페이오프 ────────────────────────────────────────────────────────────────
const P_W = 360, P_APP = Math.round(P_W * 2622 / 1206), P_ST = 36, P_PAD = 11;
const P_H = P_ST + P_APP + P_PAD * 2, P_BW = P_W + P_PAD * 2;
const IMG_S = P_W / 1206;
const BOX = { x: 93, y: 749, w: 325, h: 238 };      // CALLOUT_COORDS.json 실측

const Payoff: React.FC = () => {
  const f = useCurrentFrame();
  const local = f - PAYOFF;
  if (local < -8) return null;
  const rise = interpolate(local, [0, 22], [280, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const o = seg(local, 0, 12);
  const lift = seg(local, 16, 32);
  const scroll = 236;
  return (
    <div style={{ position: 'absolute', left: (W - P_BW) / 2, top: 470 + rise, width: P_BW, height: P_H, opacity: o }}>
      <div style={{
        position: 'absolute', left: -46, top: P_H - 24, width: P_BW + 92, height: 120,
        borderRadius: '50%', background: 'rgba(2,4,9,0.6)', filter: 'blur(34px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 50,
        background: 'linear-gradient(104deg,#E6ECF6 0%,#AAB7C9 22%,#68758A 52%,#9AA8BC 76%,#DCE4F0 100%)',
        boxShadow: '0 28px 66px rgba(0,0,0,0.55)',
      }} />
      <div style={{ position: 'absolute', inset: 6, borderRadius: 44, background: '#04050A' }} />
      <div style={{
        position: 'absolute', left: P_PAD, top: P_PAD, width: P_W, height: P_ST + P_APP,
        borderRadius: 40, overflow: 'hidden', background: '#070A10',
      }}>
        <Img src={staticFile('ad/tall-command-overview.png')} style={{
          position: 'absolute', left: 0, top: P_ST - scroll * IMG_S, width: P_W, display: 'block',
        }} />
        <div style={{
          position: 'absolute', left: '50%', top: 8, width: 74, height: 22,
          marginLeft: -37, borderRadius: 11, background: '#000',
        }} />
      </div>
      {/* FREE — 엔드카드보다 먼저. 폰이 뜨는 순간부터 붙어 있는다 */}
      <div style={{
        position: 'absolute', left: P_BW - 96, top: -34, opacity: seg(local, 10, 22),
        transform: `rotate(-7deg) scale(${0.86 + seg(local, 10, 24) * 0.14})`,
        background: C.accent, color: C.ink, borderRadius: 10, padding: '9px 18px',
        fontFamily, fontSize: 34, fontWeight: 900, letterSpacing: '0.06em',
        boxShadow: '0 10px 30px rgba(0,0,0,0.55)', whiteSpace: 'nowrap',
      }}>FREE</div>
      {lift > 0.01 && (
        <div style={{
          position: 'absolute',
          left: P_PAD + BOX.x * IMG_S, top: P_PAD + P_ST + (BOX.y - scroll) * IMG_S,
          width: BOX.w * IMG_S, height: BOX.h * IMG_S,
          transform: `translate(${-92 * lift}px, ${-124 * lift}px) scale(${1 + lift * 1.3})`,
          borderRadius: 12, border: `3px solid ${C.accent}`, background: '#0A0F18',
          boxShadow: `0 26px 66px rgba(0,0,0,0.7), 0 0 34px ${C.accent}77`, opacity: lift,
        }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 9, overflow: 'hidden' }}>
            <Img src={staticFile('ad/tall-command-overview.png')} style={{
              position: 'absolute', width: P_W, display: 'block',
              left: -BOX.x * IMG_S, top: -BOX.y * IMG_S,
            }} />
          </div>
        </div>
      )}
    </div>
  );
};

// ── 고정 타이틀 (DTW 차용 — 상단 필이 끝까지 남는다) ────────────────────────
const Title: React.FC = () => {
  const f = useCurrentFrame();
  const o = Math.min(seg(f, 2, 12), 1 - seg(f, CTA_FROM - 10, CTA_FROM));
  return (
    <div style={{ position: 'absolute', left: 76, right: 76, top: 152, opacity: o, fontFamily }}>
      <div style={{
        display: 'inline-block', padding: '9px 20px', borderRadius: 9, background: C.accent,
        color: C.ink, fontSize: 25, fontWeight: 900, letterSpacing: '0.1em', marginBottom: 13,
      }}>OPTIONS · EXPLAINED</div>
      <div style={{
        fontSize: 80, lineHeight: 1.0, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em',
        textShadow: '0 4px 22px rgba(0,0,0,0.55)',
      }}>MAX PAIN</div>
    </div>
  );
};

const TERMS = ['MAX PAIN', 'GAMMA FLIP', 'WHALE FLOW', 'DARK POOL'];
const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const p = seg(f, 2, 16);
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 150, textAlign: 'center', opacity: p, fontFamily }}>
        <div style={{ fontSize: 66, fontWeight: 900, color: '#fff', letterSpacing: '-0.035em' }}>SIGNUM HQ</div>
        <div style={{
          marginTop: 16, display: 'inline-block', fontSize: 36, fontWeight: 900,
          color: C.ink, background: C.accent, borderRadius: 999, padding: '13px 40px',
          letterSpacing: '0.02em', boxShadow: '0 10px 32px rgba(0,0,0,0.5)',
        }}>FREE · iOS &amp; Android</div>
      </div>
      <div style={{ position: 'absolute', left: 40, right: 40, bottom: 300, display: 'flex', gap: 9, justifyContent: 'center' }}>
        {TERMS.map((t, i) => {
          const q = interpolate(f, [12 + i * 3, 20 + i * 3], [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.6)) });
          return (
            <div key={t} style={{
              fontFamily, fontSize: 27, fontWeight: 900, letterSpacing: '0.03em', whiteSpace: 'nowrap',
              color: C.ink, background: C.accent, borderRadius: 9, padding: '8px 15px',
              opacity: q, transform: `scale(${0.8 + q * 0.2})`,
            }}>{t}</div>
          );
        })}
      </div>
    </>
  );
};

/**
 * Ticker — 화면 하단 상시 데이터 스트립.
 * 실측: 우리 텍스트행 15.2% 로 플릿 최하(레퍼런스 19.3~34.5). 읽을 것이 모자란다.
 *       레퍼런스는 화면 어딘가에 «항상» 글자가 있다 — 자막이 비어도 화면은 안 빈다.
 */
const TICK = [
  'AMD  $466.42  ▼ 3.71%', 'MAX PAIN  $450', 'GAP  +3.65%',
  'AUG 21 EXPIRY', 'OPEN CONTRACTS AT $450  11,991', 'CALLS 4,327  ·  PUTS 7,664',
];
const Ticker: React.FC = () => {
  const f = useCurrentFrame();
  const line = TICK.join('     ●     ') + '     ●     ';
  const x = -((f * 1.9) % 2400);
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: 1560, height: 52, overflow: 'hidden',
      background: 'rgba(6,11,20,0.72)', borderTop: '1px solid rgba(226,240,255,0.22)',
      borderBottom: '1px solid rgba(226,240,255,0.22)', display: 'flex', alignItems: 'center',
    }}>
      <div style={{
        position: 'absolute', left: x, whiteSpace: 'nowrap', fontFamily, fontSize: 25,
        fontWeight: 800, color: 'rgba(236,246,255,0.9)', letterSpacing: '0.06em',
      }}>{line + line}</div>
    </div>
  );
};

// ── 본체 ────────────────────────────────────────────────────────────────────
const WHOOSH = SCENE_AT.map(([id]) => id);

export const Concept: React.FC = () => {
  const f = useCurrentFrame();
  const sc = sceneOf(f);
  const lastCut = CUTS.reduce((a, c) => (c.from <= f && c.from > a ? c.from : a), 0);
  const pop = 1 + 0.009 * Math.exp(-(f - lastCut) / 3);
  const sceneStart = SCENE_STARTS.reduce((a, s) => (s <= f && s > a ? s : a), 0);

  return (
    <AbsoluteFill style={{ background: '#0A1220', transform: `scale(${pop})` }}>
      <Bg />

      {CUTS.map((c) => (
        <Sequence key={c.id} from={c.from} durationInFrames={c.len + 10}>
          <Audio src={staticFile(`${VOICE_AD.base}/${c.id}.mp3`)} />
        </Sequence>
      ))}
      {CUTS.slice(1).map((c) => (
        <Sequence key={`t-${c.id}`} from={c.from - 2} durationInFrames={8}>
          <Audio src={staticFile(`${VOICE_AD.base}/sfx-tick.mp3`)} volume={0.32} />
        </Sequence>
      ))}
      {WHOOSH.slice(1).map((id) => (
        <Sequence key={`w-${id}`} from={at(id).from - 5} durationInFrames={22}>
          <Audio src={staticFile(`${VOICE_AD.base}/sfx-whoosh.mp3`)} volume={0.44} />
        </Sequence>
      ))}
      <Sequence from={PAYOFF + 14} durationInFrames={26}>
        <Audio src={staticFile(`${VOICE_AD.base}/sfx-impact.mp3`)} volume={0.5} />
      </Sequence>

      <Enter at={sceneStart}>
        {(sc === 'hook' || sc === 'hook2') && <SceneHook />}
        {sc === 'ladder' && <SceneLadder />}
        {sc === 'ladderZoom' && <SceneLadder zoom />}
        {sc === 'chart' && <SceneChart />}
        {sc === 'chartZoom' && <SceneChart zoom />}
        {sc === 'zones' && <SceneChart zones />}
        {sc === 'zonesDn' && <SceneChart zones zoom />}
      </Enter>
      {SCENE_STARTS.slice(1).map((a) => <Flash key={a} at={a} />)}
      {f < PAYOFF && <Ticker />}

      {f < PAYOFF && <Panel />}
      <Title />
      <Payoff />

      {CUTS.map((c) => (
        <Sequence key={`c-${c.id}`} from={c.from} durationInFrames={c.len}>
          <Caption id={c.id} len={c.len} />
        </Sequence>
      ))}

      {/* CTA — 브리핑과 «같은» 고정 자산 클립. 채널 전체가 한 장면으로 끝난다 */}
      <Sequence from={CTA_FROM}>
        <AbsoluteFill style={{ background: '#05070C' }}>
          <OffthreadVideo muted src={staticFile('shorts/outro/outro.mp4')}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      </Sequence>

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 52, textAlign: 'center',
        fontFamily, fontSize: 19, fontWeight: 600, color: 'rgba(210,228,250,0.55)',
      }}>Informational only. Not investment advice.</div>
    </AbsoluteFill>
  );
};
