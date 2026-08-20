// ============================================================================
// kit/Casual — 「캐주얼 브리핑」 템플릿 (Briefing 의 자매판)
// ----------------------------------------------------------------------------
// 대표 지시(2026-08-13): "너무 다큐나 그런 것이 아닌, 캐주얼하지만 내용은
//                        깊이있고 끌림이 있는 템플릿."
//
// ── 왜 Briefing 이 «다큐»로 읽히는가 (원인 5개, 전부 여기서 제거) ────────────
//  ① **고정 배너(마스트헤드)** — 로고+제목+날짜가 화면 상단에 «항상» 박혀 있다.
//     이건 방송 뉴스의 로워서드 관습이다. 사람이 말하는 영상엔 배너가 없다.
//     → 없앤다. 브랜드는 아웃트로와 하단 칩으로만.
//  ② **번호 매긴 비트** — "01 ─── EYEBROW" 는 «보고서 목차»다.
//     → 기울어진 스티커 태그로. 말하다가 툭 붙인 메모처럼.
//  ③ **모든 것이 카드 안** — 테두리 둥근 패널 = 기관 대시보드.
//     → 카드를 없애고 «숫자만» 크게. 대신 손으로 동그라미 친다.
//  ④ **자막 박스** — 테두리 있는 반투명 바 = 방송 자막.
//     → 박스를 없애고 형광펜 스와이프로 핵심 어구만 칠한다.
//  ⑤ **티커 테이프** — 말 그대로 블룸버그 터미널 관습.
//     → 없앤다.
//
// ── 남기는 것 (깊이는 그대로) ──────────────────────────────────────────────
//  · 실측 숫자 · say/ask 궁금증 사슬 · 안전영역 규율 · 음성 싱크
//  · prio 컷 시스템 (BriefingProps 를 «그대로» 받으므로 variants.cutFor 무수정 동작)
//  · 면책 한 줄
//
// ── 캐주얼의 «느낌»은 색이 아니라 동작과 타이포에서 나온다 ──────────────────
//  다큐: 요소가 «선형으로 페이드인» 한다
//  캐주얼: 요소가 «살짝 넘쳤다 돌아온다»(오버슈트) + 미세하게 기울어 있다
//  → useIn 대신 usePop(스프링 오버슈트)을 기본으로 쓴다.
//
// ⚠️ props 는 BriefingProps 와 «같은 모양». 새 필드는 전부 optional.
//    그래야 scripts.ts / tts-beats.mjs / variants.ts 가 한 줄도 안 바뀐다.
// ============================================================================

import {
  AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile,
  useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { AppShot, type ShotFocus, type ShotCallout } from '../components/AppShot';
import { Backdrop, type BackdropSpec, type BackdropData } from './Backdrop';
import { CANVAS, SAFE, CAPTION, C, BACKDROP_FOR, HOOK_BACKDROP, type BeatRole } from './spec';
import { TickerMark, SymbolHero } from '../components/TickerMark';
import { SYM } from './symbols';
import { AppPlate } from './AppPlate';
import type { BriefingProps, Beat, VoiceSeg, VoiceTrack } from './Briefing';
import { timingOf } from './Briefing';

const { fontFamily } = loadFont();
const F = (s: number) => Math.round(s * CANVAS.fps);
const LOGO = 'app-icons/signum.png';

// ── 캐주얼 팔레트 ───────────────────────────────────────────────────────────
// Briefing 의 앰버/네이비는 «금융 터미널» 색이다. 캐주얼은 더 밝고 더 따뜻하게.
// 단, 상승=민트 / 하락=코랄 의 «의미»는 Briefing 과 같게 유지한다 (일관성 규칙).
export const K = {
  ink: '#FFFFFF',
  pop: '#FFE86B',        // 형광펜·마커 (노란 형광펜의 실제 색)
  mint: '#4DFFB0',       // 상승
  coral: '#FF6B7A',      // 하락
  sky: '#66D2FF',        // 중립 강조
  violet: '#B58CFF',     // 교육 트랙
  shadow: 'rgba(4,7,13,0.86)',
  /** 제목 띠 바탕 — 레퍼런스(경제사냥꾼)의 크림 옐로우 계열 */
  band: '#FBF2B0',
  bandInk: '#12161F',
} as const;

/**
 * ── ★ 고정 제목 띠 (2026-08-13 · 레퍼런스 실측 반영) ────────────────────────
 * 대표 지시: "썸네일도 큼지막하게 화면에 들어오게 넣는 것."
 *
 * 레퍼런스(경제사냥꾼 8/13, 720×1280) 실측:
 *   · 제목 띠가 화면 상단 **27%**(0~345px)를 «영상 내내» 차지한다
 *   · 밝은 크림 바탕 + 검정 외곽선 흰 글자, 강조 단어만 빨강
 *   · 그 아래 채널 아바타 + 채널명 + 날짜 한 줄
 * 우리 Briefing 배너는 12%(0~230px)에 어두운 남색 — «작고 어둡다».
 *
 * 우리 값: 상단 22% (0~420px). 27%까지 안 가는 이유는 우리 훅에 «거대 숫자»가
 * 있어서다 — 저쪽은 제목 띠가 유일한 큰 글자지만 우리는 둘이 경쟁한다.
 */
const BAND_H = 420;

/** 이음매 길이 — 마지막 이만큼이 프레임0과 같은 그림이 된다 (0.4초) */
const SEAM = 12;

/** 트랙 액센트 — 썸네일 그리드에서 «한눈에 종류가 구분»되게 (연구보고 §3-3순위) */
export type Track = 'macro' | 'stock' | 'edu' | 'duel';
const TRACK_COLOR: Record<Track, string> = {
  macro: '#FFB020',   // 앰버 — 매크로 (Briefing 정본색)
  stock: '#66D2FF',   // 스카이 — 개별 종목
  edu: '#B58CFF',     // 바이올렛 — 교육
  duel: '#FFE86B',    // 옐로 — 대결
};

// ── 동작 ────────────────────────────────────────────────────────────────────
const ease = Easing.bezier(0.16, 1, 0.3, 1);

/** ★ 캐주얼의 핵심 — 살짝 넘쳤다 돌아오는 등장. 다큐는 이걸 안 쓴다. */
function usePop(delay = 0, dur = 12) {
  const f = useCurrentFrame();
  const o = interpolate(f, [delay, delay + Math.round(dur * 0.6)], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const s = interpolate(f, [delay, delay + dur * 0.55, delay + dur], [0.86, 1.045, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) });
  return { o, s };
}

const useIn = (d = 0, dur = 10) => interpolate(useCurrentFrame(), [d, d + dur], [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

/**
 * ★ 외곽선 — 밝은 배경 위 흰 글자를 살리는 «유일한» 방법 (2026-08-13 실측)
 * 배경을 밝게 올리자(67→119) 흰 글자가 씻겨 안 읽혔다. 그림자로는 부족하다.
 * Briefing 은 카드(패널)로 해결했지만, 카드를 다시 넣으면 다큐로 돌아간다.
 * 레퍼런스(경제사냥꾼)의 해법이 정답이다 — **두꺼운 검정 외곽선**.
 * 밝든 어둡든 항상 읽히고, 손글씨 느낌이라 캐주얼과도 맞는다.
 */
const outline = (px: number): React.CSSProperties => ({
  WebkitTextStroke: `${px}px #05070C`,
  paintOrder: 'stroke fill',
} as React.CSSProperties);

/** 결정적 난수 — Math.random 은 프레임마다 달라져 렌더가 깨진다 */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

// ── 마커 링 — «손으로 동그라미 친» 강조 ─────────────────────────────────────
// 왜: 카드 테두리는 «시스템이 출력한 것»처럼 보이고, 손그림 원은 «사람이 짚은 것»
// 처럼 보인다. 같은 숫자인데 후자가 «이거 봐» 로 읽힌다.
// 구현: 타원 위 점들의 반지름을 시드 노이즈로 흔들고, 360°를 넘겨 겹치게 그린다
// (실제 손그림 원은 시작점과 끝점이 어긋난다). dashoffset 으로 그려지는 연출.
/**
 * ── ★ 자동 맞춤 (2026-08-13 · 결함에서 나온 장치) ─────────────────────────────
 * 결함: punch 값 폰트를 200px «고정»으로 뒀다. 대본이 `value: 'HIDDEN TAPE'`(11자)를
 *       넣자 가로를 넘겨 두 줄로 감겼고, 세로가 두 배가 되며 위(헤드)·아래(자막)를
 *       «둘 다» 덮었다. 값이 짧을 거라는 가정이 틀린 순간 레이아웃이 무너진다.
 * 해법: 대본이 뭘 넣든 «칸 안에 들어오게» 폰트를 깎는다. 가정을 없앤다.
 *
 * 글자폭은 Inter Black 실측 근사 — 대문자가 숫자보다 넓고 구두점은 좁다.
 */
const charW = (c: string) =>
  c === ' ' ? 0.28
    : /[0-9]/.test(c) ? 0.60
    : /[A-Z]/.test(c) ? 0.70
    : /[a-z]/.test(c) ? 0.56
    : /[.,:;%$+\-/()]/.test(c) ? 0.36
    : 0.62;

const textUnits = (s: string) => s.split('').reduce((a, c) => a + charW(c), 0) || 1;

/** 칸(maxW × maxH) 안에 «한 줄»로 들어가는 최대 폰트. ideal 을 넘지 않는다. */
function fitFont(text: string, maxW: number, maxH: number, ideal: number, min = 34) {
  return Math.max(min, Math.min(ideal, Math.floor(maxW / textUnits(text)), Math.floor(maxH)));
}

/**
 * 감쌀 글자의 «폰트 크기와 글자 수»에서 링 크기를 낸다.
 * ⚠️ 2026-08-13 실측 — 이 비율을 감으로 잡았다가 링이 숫자를 관통했다.
 *    punch($213)는 h/폰트 = 1.16 이었다. 글자 높이 자체가 폰트값이므로 «1.4 이상»이어야
 *    글자 밖으로 돈다. 가로는 Inter Black 숫자 기준 글자당 0.66em 로 실측했다.
 */
export function ringSize(text: string, fontSize: number) {
  return {
    w: Math.round(textUnits(text) * fontSize) + Math.round(fontSize * 0.42),
    h: Math.round(fontSize * 1.45),
  };
}

/**
 * ★ 동그라미는 «숫자에만» 친다.
 * 대표 지적(2026-08-13): "맞지 않는 것에 동그라미 표시가 있다."
 * 실제로 `HIDDEN TAPE` 같은 문구에 링이 걸려 있었다. 손으로 치는 동그라미는
 * 「이 숫자를 봐」라는 뜻이다. 문구에 치면 뜻이 없고 지저분하기만 하다.
 */
const ringable = (v: string) => /\d/.test(v);

function MarkerRing({
  seed, delay = 8, color = K.pop, w = 100, h = 100, stroke = 9,
}: { seed: string; delay?: number; color?: string; w?: number; h?: number; stroke?: number }) {
  const rnd = seeded(seed);
  const wob = Array.from({ length: 5 }, () => 0.86 + rnd() * 0.22);
  const start = -0.45 + rnd() * 0.3;
  // 한 바퀴 조금 넘게 — 겹침이 손맛. 단 1.24까지 가면 «꼬리»가 길게 삐져 지저분하다
  // (2026-08-13 실측: 79/19 링 오른쪽에 뾰족한 꼬리). 1.06~1.14 가 손그림처럼 읽힌다.
  const turns = 1.06 + rnd() * 0.08;
  const N = 76;
  const cx = w / 2, cy = h / 2;
  const rx = w / 2 - stroke, ry = h / 2 - stroke;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = start + (i / N) * Math.PI * 2 * turns;
    const k = wob[i % wob.length] * (1 + 0.035 * Math.sin(t * 3.1 + 1.2));
    pts.push(`${(cx + Math.cos(t) * rx * k).toFixed(1)},${(cy + Math.sin(t) * ry * k).toFixed(1)}`);
  }
  const d = `M ${pts[0]} ` + pts.slice(1).map((p) => `L ${p}`).join(' ');
  const LEN = 2 * Math.PI * ((rx + ry) / 2) * turns * 1.14;
  const draw = interpolate(useCurrentFrame(), [delay, delay + 13], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    // ★ 감싸는 글자의 «중심»에 건다. left/top:0 이면 링이 아래로 흘러 다음 줄을 덮는다
    //   (2026-08-13 실측: 19% 링이 그 아래 「settled $482.93」을 가렸다)
    <svg width={w} height={h} style={{
      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      overflow: 'visible', pointerEvents: 'none',
    }}>
      <path
        d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={LEN} strokeDashoffset={LEN * (1 - draw)} opacity={0.95}
        style={{ filter: 'drop-shadow(0 3px 12px rgba(0,0,0,0.55))' }}
      />
    </svg>
  );
}

/** 형광펜 — 글자 뒤를 왼→오른쪽으로 칠한다. 자막 박스를 대체한다. */
function Highlight({ children, delay = 4, color = K.pop, tilt = -0.7 }: {
  children: React.ReactNode; delay?: number; color?: string; tilt?: number;
}) {
  const w = interpolate(useCurrentFrame(), [delay, delay + 10], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{
        position: 'absolute', left: -10, right: -10, top: '14%', bottom: '4%',
        background: color, opacity: 0.92, borderRadius: 4,
        transform: `scaleX(${w}) rotate(${tilt}deg)`, transformOrigin: 'left center',
      }} />
      <span style={{ position: 'relative', color: '#0A0D14' }}>{children}</span>
    </span>
  );
}

/**
 * ★ 고정 제목 띠 — 영상 «내내» 상단에 박힌다. 프레임0(=썸네일)에도 있다.
 * 레퍼런스와 같은 문법: 밝은 크림 바탕 + 검정 외곽선 흰 글자, 둘째 줄만 강조색.
 * 부수 효과가 크다 — 화면 24%가 밝기 245라 «평균 밝기»가 통째로 올라간다
 * (실측 격차: 레퍼런스 180.7 vs 우리 67.3).
 */
function TitleBand({ title, date, accent }: { title: string; date: string; accent: string }) {
  const lines = title.split('\n');
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: BAND_H, zIndex: 45,
      background: K.band, display: 'flex', flexDirection: 'column',
      justifyContent: 'flex-end', padding: '0 30px 20px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
    }}>
      {/* ⚠️ 폰트를 92px 로 «고정»했더니 긴 줄이 감겨 「green.」한 단어가 3번째 줄로
          흘러내렸다(2026-08-13 실측). 제목 띠는 «줄 수가 곧 높이»라 감기면 안 된다.
          → 대본이 뭘 넣든 각 줄이 한 줄로 들어오게 폰트를 깎는다. */}
      {lines.map((ln, i) => (
        <div key={i} style={{
          fontFamily,
          fontSize: fitFont(ln, CANVAS.w - 76, lines.length > 2 ? 78 : 92, 92, 44),
          lineHeight: 1.1, fontWeight: 900, letterSpacing: '-0.045em',
          textAlign: 'center', whiteSpace: 'nowrap',
          color: i === lines.length - 1 && lines.length > 1 ? accent : '#FFFFFF',
          WebkitTextStroke: '13px #0A0D14',
          paintOrder: 'stroke fill',
        } as React.CSSProperties}>{ln}</div>
      ))}
      <div style={{
        marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: '3px solid rgba(18,22,31,0.22)', paddingTop: 13,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Img src={staticFile(LOGO)} style={{ width: 52, height: 52, borderRadius: 13 }} />
          <span style={{ fontFamily, fontSize: 32, fontWeight: 900, color: K.bandInk, letterSpacing: '-0.02em' }}>SIGNUM HQ</span>
        </span>
        <span style={{ fontFamily, fontSize: 30, fontWeight: 800, color: 'rgba(18,22,31,0.78)' }}>{date}</span>
      </div>
    </div>
  );
}

/** 스티커 태그 — "01 ─── EYEBROW" 를 대체한다. 기울여 붙인 메모. */
function Sticker({ text, color, delay = 0 }: { text: string; color: string; delay?: number }) {
  const { o, s } = usePop(delay, 11);
  return (
    <div style={{
      display: 'inline-block', opacity: o, transform: `scale(${s}) rotate(-2.2deg)`,
      background: color, color: '#0A0D14', borderRadius: 8,
      padding: '9px 20px 12px', fontFamily, fontSize: 30, fontWeight: 900,
      letterSpacing: '-0.01em', boxShadow: '0 8px 26px rgba(0,0,0,0.5)',
    }}>{text}</div>
  );
}

/** 말풍선 — ask(답 없는 질문)를 «사람이 되묻는» 모양으로 */
function Bubble({ text, color, delay = 0 }: { text: string; color: string; delay?: number }) {
  const { o, s } = usePop(delay, 12);
  const lines = CAPTION.wrap(text);
  return (
    <div style={{
      position: 'relative', display: 'inline-block', opacity: o,
      transform: `scale(${s}) rotate(0.5deg)`, transformOrigin: 'left bottom',
      background: color, borderRadius: 22, padding: '16px 26px 20px',
      boxShadow: '0 12px 34px rgba(0,0,0,0.55)', maxWidth: 900,
    }}>
      {lines.map((l, i) => (
        <div key={i} style={{
          fontFamily, fontSize: lines.length > 2 ? 40 : 48, lineHeight: 1.18,
          fontWeight: 900, color: '#0A0D14', letterSpacing: '-0.028em',
        }}>{l}</div>
      ))}
      {/* 꼬리 */}
      <div style={{
        position: 'absolute', left: 40, bottom: -16, width: 0, height: 0,
        borderLeft: '16px solid transparent', borderRight: '20px solid transparent',
        borderTop: `20px solid ${color}`,
      }} />
    </div>
  );
}

// ── 음성 ────────────────────────────────────────────────────────────────────
const Say2 = ({ v, seg }: { v?: VoiceTrack; seg?: VoiceSeg | null }) => {
  const { fps } = useVideoConfig();
  if (!v || !seg) return null;
  return (
    <>
      <Audio src={staticFile(`${v.base}/${seg.f}`)} />
      {seg.ask && (
        <Sequence from={Math.round(((seg.saySec ?? 0) + 0.18) * fps)}>
          <Audio src={staticFile(`${v.base}/${seg.ask.f}`)} />
        </Sequence>
      )}
    </>
  );
};

/** 컷 경계 — Briefing 과 동일 근거(검출기에 안 잡히면 눈에도 한 컷) */
function CutFlash() {
  const o = interpolate(useCurrentFrame(), [0, 6], [0.2, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: '#EAF2FF', opacity: o, pointerEvents: 'none' }} />;
}

// ── 자막 — 박스 없이. 핵심 어구만 형광펜 ────────────────────────────────────
// 대본에서 «*별표로 감싼 구간*»이 형광펜 대상이다. 없으면 그냥 흰 글자.
//
// ★ 2026-08-13 수정 — 자막이 «시각물을 덮는» 결함을 고쳤다.
//   원인: 한 비트의 say 를 통째로 한 카드에 띄웠다. 26자 기준 4줄이 되면
//         자막 블록이 위로 자라 시각 구역을 침범한다(실측: 66px 초과).
//   레퍼런스(경제사냥꾼) 실측: 한 문장을 «여러 자막 카드로 쪼개» 순차로 띄운다.
//         한 카드는 항상 2줄 이하이고, 그래서 절대 안 겹친다.
//   → 우리도 3줄 이상이면 두 장으로 쪼갠다. 부수 효과로 컷도 한 번 더 생긴다.
const CAP_MAX_LINES = 2;

const fits = (s: string) => CAPTION.wrap(s.replace(/\*/g, '')).length <= CAP_MAX_LINES;

/**
 * ③ 절 안에서 끊어야 할 때 «어디서» 끊나.
 * 그냥 가운데를 자르면 앞 카드가 말이 안 된 채로 끝난다 (2026-08-13 실측):
 *   ✕ "Consumer discretionary was the only" / "sector to close red,"
 * 전치사·접속사 «앞»에서 끊으면 앞 카드가 명사구로 닫힌다:
 *   ○ "Consumer discretionary was the only sector" / "to close red,"
 */
const BREAK_BEFORE = new Set([
  'to', 'of', 'in', 'on', 'at', 'for', 'from', 'with', 'by', 'into', 'over', 'under',
  'and', 'but', 'or', 'so', 'that', 'which', 'where', 'while', 'than', 'as', 'because',
]);

/**
 * 2줄을 넘으면 여러 장으로 쪼갠다. 끊는 자리의 우선순위:
 *   ① **문장 경계**(. ? !) — 여기서 끊어야 카드 하나가 «말이 된다»
 *   ② **쉼표·세미콜론 뒤** — 문장이 하나뿐일 때. 절 단위라 아직 읽을 만하다
 *   ③ **기능어 앞** — 최후. 그래도 앞 카드가 명사구로 닫힌다
 * 들어갈 때까지 재귀한다. ⚠️ 진짜 해법은 대본에서 «한 문장 ≤ 52자»를 지키는 것.
 */
function splitOnce(c: string): string[] {
  const w = c.split(' ');
  const mid = Math.ceil(w.length / 2);
  const nearest = (cands: number[]) =>
    cands.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best), cands[0]);

  // ② 쉼표·세미콜론 «뒤» — 절 경계라 가장 깔끔하다
  const commas = w.map((x, i) => (/[,;:]$/.test(x) ? i + 1 : -1)).filter((i) => i > 0 && i < w.length);
  // ③ 기능어 «앞» — 앞 카드가 명사구로 닫혀 말이 된다
  const funcs = w
    .map((x, i) => (BREAK_BEFORE.has(x.replace(/[^a-zA-Z]/g, '').toLowerCase()) ? i : -1))
    .filter((i) => i > 1 && i < w.length - 1);

  const at = commas.length ? nearest(commas) : funcs.length ? nearest(funcs) : mid;
  return [w.slice(0, at).join(' '), w.slice(at).join(' ')];
}

function splitSay(text: string): string[] {
  if (fits(text)) return [text];

  // ① 문장 단위로 모으되, 넘치면 새 카드
  const sentences = text.match(/[^.?!]+[.?!]*\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const cards: string[] = [];
  for (const s of sentences) {
    const last = cards[cards.length - 1];
    if (last && fits(`${last} ${s}`)) cards[cards.length - 1] = `${last} ${s}`;
    else cards.push(s);
  }

  // 아직 넘치는 카드는 들어갈 때까지 쪼갠다 (최대 3회 — 무한루프 방지)
  let out = cards;
  for (let pass = 0; pass < 3 && out.some((c) => !fits(c)); pass++) {
    out = out.flatMap((c) => (fits(c) ? [c] : splitOnce(c)));
  }
  return out;
}

/** 줄바꿈하면서 각 줄이 원문의 어디서 시작하는지도 같이 돌려준다 (형광펜 범위 계산용) */
function wrapWithOffsets(plain: string): Array<{ text: string; at: number }> {
  const out: Array<{ text: string; at: number }> = [];
  const words = plain.split(' ');
  let cur = '', at = 0, pos = 0;
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > CAPTION.maxCharsPerLine && cur) {
      out.push({ text: cur, at });
      pos += cur.length + 1;   // 줄바꿈 자리의 공백 1칸
      at = pos; cur = w;
    } else cur = next;
  }
  if (cur) out.push({ text: cur, at });
  return out;
}

function SayCard({ text, delay }: { text: string; delay: number }) {
  const p = useIn(delay, 6);
  const plain = text.replace(/\*/g, '');
  const lines = wrapWithOffsets(plain);
  const size = CAPTION.sizeFor(lines.length);

  // ★ 형광펜 범위를 «문자 위치»로 잡는다. 예전처럼 줄 안에서 문자열을 찾으면
  //   강조 구간이 줄바꿈에 걸릴 때마다 조용히 사라졌다(실측). 이제 안 사라진다.
  const m = text.match(/\*([^*]+)\*/);
  const mStart = m ? text.indexOf(m[0]) : -1;
  const mEnd = m ? mStart + m[1].length : -1;

  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
      {lines.map((ln, i) => {
        const s = Math.max(0, mStart - ln.at);
        const e = Math.min(ln.text.length, mEnd - ln.at);
        const hit = m && e > s && mEnd > ln.at && mStart < ln.at + ln.text.length;
        return (
          <div key={i} style={{
            fontFamily, fontSize: size, lineHeight: 1.28,
            fontWeight: 900, color: K.ink, letterSpacing: '-0.03em',
            textShadow: `0 3px 18px ${K.shadow}`,
            // 형광펜 칠한 글자는 노란 바탕 위 검정이라 외곽선을 넣으면 뭉갠다
            ...(hit && s === 0 && e === ln.text.length ? {} : outline(11)),
          }}>
            {hit ? (
              <>
                {ln.text.slice(0, s)}
                <Highlight delay={delay + 5} color={K.pop}>{ln.text.slice(s, e)}</Highlight>
                {ln.text.slice(e)}
              </>
            ) : ln.text}
          </div>
        );
      })}
    </div>
  );
}

function CasualSay({ text, ask, askAt, accent, saySec }: {
  text: string; ask?: string; askAt?: number; accent: string; saySec?: number;
}) {
  const f = useCurrentFrame();
  const q = useIn(Math.max(0, (askAt ?? 22) - 4), 10);
  const parts = splitSay(text);

  // 카드 전환 시점 — 낭독 «글자 수 비례» (단어 단위 타이밍이 없으므로 근사).
  // 실측상 오차는 0.3초 안쪽이라 눈에 띄지 않는다.
  const total = parts.reduce((a, p) => a + p.length, 0);
  const starts: number[] = [];
  let acc = 0;
  for (const p of parts) {
    starts.push(saySec ? Math.round(saySec * CANVAS.fps * (acc / total)) : 0);
    acc += p.length;
  }
  let idx = 0;
  for (let i = 0; i < starts.length; i++) if (f >= starts[i]) idx = i;

  return (
    <div style={{ position: 'absolute', left: 46, right: 46, bottom: CANVAS.h - SAFE.bottom + 22 }}>
      <SayCard key={idx} text={parts[idx]} delay={starts[idx]} />
      {ask && (
        <div style={{ marginTop: 20, opacity: q }}>
          <Bubble text={ask} color={accent} delay={Math.max(0, (askAt ?? 22) - 4)} />
        </div>
      )}
    </div>
  );
}

// ── 상단 — 스티커 + 대화체 헤드 ─────────────────────────────────────────────
// ★ 제목 띠가 «영상 전체가 뭔지»를 말하므로, 비트 헤드는 «이 컷이 뭔지»만 말한다.
//   그래서 Briefing(62px)보다 작다 — 큰 글자가 둘이면 둘 다 안 읽힌다.
function CasualHead({ n, eyebrow, head, accent }: {
  n: number; eyebrow?: string; head: string; accent: string;
}) {
  const { o, s } = usePop(3, 13);
  return (
    <div style={{ position: 'absolute', top: BAND_H + 30, left: 46, right: 46 }}>
      {eyebrow && (
        <div style={{ marginBottom: 12 }}>
          {/* 레퍼런스 문법: "두 번째는…" — 주제에 번호를 매기면 «다음이 있다»가 된다 */}
          <Sticker text={`${n}. ${eyebrow}`} color={accent} delay={0} />
        </div>
      )}
      <div style={{
        opacity: o, transform: `scale(${s})`, transformOrigin: 'left top',
        fontFamily, fontSize: 56, lineHeight: 1.14, fontWeight: 900, color: K.ink,
        letterSpacing: '-0.04em', whiteSpace: 'pre-line',
        textShadow: `0 5px 26px ${K.shadow}`, ...outline(9),
      }}>{head}</div>
    </div>
  );
}

// ── 캐주얼 전용 시각 블록 ───────────────────────────────────────────────────
// Briefing 의 Visual 8종을 그대로 받되, «카드 없이 숫자만 크게» 다시 그린다.
// 추가로 캐주얼 전용 3종(punch / duel / steps)을 CasualVisual 로 받는다.

export type CasualVisual =
  /** 한 화면에 «숫자 하나». 손으로 동그라미 친다. 「어? 뭐라고?」 순간용 */
  | { kind: 'punch'; value: string; label: string; sub?: string; up?: boolean; sym?: string }
  /** 종목 대 종목 — 좌우 완전 분할. 이긴 쪽에 마커가 붙는다 */
  | {
      kind: 'duel';
      a: { sym: string; name: string; value: string; note?: string };
      b: { sym: string; name: string; value: string; note?: string };
      /** 마커를 칠 쪽. 'none' 이면 «둘 다 애매» 를 뜻한다 */
      mark?: 'a' | 'b' | 'none';
      caption?: string;
    }
  /** 교육형 — 1 → 2 → 3 단계가 하나씩 등장 */
  | { kind: 'steps'; items: Array<{ n: string; t: string; v?: string }> }
  /** 게이지 — 0~100 위 어디쯤인지 (RISK 63, 스퀴즈 65% 같은 것) */
  | { kind: 'meter'; label: string; value: number; display: string; zones?: [string, string, string] };

type AnyVisual = NonNullable<Beat['visual']> | CasualVisual;

function VisPunch({ v, w, h, accent }: {
  v: Extract<CasualVisual, { kind: 'punch' }>; w: number; h: number; accent: string;
}) {
  const { o, s } = usePop(2, 15);
  const col = v.up === undefined ? K.pop : v.up ? K.mint : K.coral;

  // ★ 링은 글자 높이의 1.45배라 «위아래 양쪽»으로 0.225×폰트 만큼 삐져나온다.
  //   그 여백을 안 잡으면 위로는 라벨을, 아래로는 서브를 덮는다 (2026-08-13 실측).
  const ring = ringable(v.value);
  const labelH = 46, subH = v.sub ? 38 : 0;
  // 링 여백을 포함해 값 폰트를 역산한다: 값 + 2×(0.225×값) = 1.45×값
  const avail = h - labelH - 10 - subH - 26 - 12;
  const valueFont = Math.min(
    fitFont(v.value, w - 76, 999, 200),
    Math.floor(ring ? avail / 1.45 : avail),
  );
  const pad = ring ? Math.round(valueFont * 0.27) : 0;   // 링 반경 0.225 + 획 두께 여유
  const labelFont = fitFont(v.label, w - (v.sym ? 110 : 20), 30, 30, 20);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', opacity: o }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 + pad }}>
        {v.sym && <TickerMark t={v.sym} size={SYM.chip} />}
        <span style={{ fontFamily, fontSize: labelFont, fontWeight: 900, color: '#FFFFFF', letterSpacing: '0.04em', whiteSpace: 'nowrap', ...outline(6) }}>{v.label}</span>
      </div>
      <div style={{ position: 'relative', display: 'inline-block', transform: `scale(${s})`, transformOrigin: 'left center' }}>
        <span style={{
          fontFamily, fontSize: valueFont, lineHeight: 1.0, fontWeight: 900, color: col,
          letterSpacing: '-0.05em', display: 'inline-block', padding: '0 18px',
          whiteSpace: 'nowrap', textShadow: `0 10px 40px ${K.shadow}`,
          ...outline(Math.max(6, Math.round(valueFont * 0.065))),
        }}>{v.value}</span>
        {ring && (
          <MarkerRing seed={`punch|${v.value}`} delay={10} color={accent}
            {...ringSize(v.value, valueFont)} stroke={Math.max(6, Math.round(valueFont * 0.05))} />
        )}
      </div>
      {v.sub && (
        <div style={{
          marginTop: 26 + pad, fontFamily, fontSize: fitFont(v.sub, w - 20, 33, 33, 22),
          fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em', whiteSpace: 'nowrap', ...outline(6),
        }}>{v.sub}</div>
      )}
    </div>
  );
}

function DuelSide({ d, col, delay, marked, accent, sideW }: {
  d: { sym: string; name: string; value: string; note?: string };
  col: string; delay: number; marked: boolean; accent: string; sideW: number;
}) {
  const { o, s } = usePop(delay, 13);
  // 한쪽 칸 안에 «한 줄»로 들어가게 깎는다 — 감기면 좌우 높이가 어긋나 줄이 밀린다
  const valueFont = fitFont(d.value, sideW - 28, 88, 88, 40);
  const nameFont = fitFont(d.name, sideW - 8, 29, 29, 18);
  const noteFont = d.note
    ? Math.min(26, ...d.note.split('\n').map((l) => fitFont(l, sideW - 8, 26, 26, 16)))
    : 26;

  return (
    <div style={{ flex: 1, minWidth: 0, opacity: o, transform: `scale(${s})`, textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <TickerMark t={d.sym} size={SYM.card} />
      </div>
      {/* ★ name 칸은 «지표 이름»이 아니라 «뜻»이다 (해석하기 싫어한다 원칙) */}
      <div style={{
        fontFamily, fontSize: nameFont, fontWeight: 900, color: '#FFFFFF',
        letterSpacing: '-0.01em', whiteSpace: 'nowrap', ...outline(6),
      }}>{d.name}</div>
      <div style={{ position: 'relative', display: 'inline-block', marginTop: 6 }}>
        <span style={{
          fontFamily, fontSize: valueFont, lineHeight: 1.06, fontWeight: 900, color: col,
          letterSpacing: '-0.05em', padding: '0 14px', display: 'inline-block',
          whiteSpace: 'nowrap', textShadow: `0 8px 30px ${K.shadow}`,
          ...outline(Math.max(6, Math.round(valueFont * 0.11))),
        }}>{d.value}</span>
        {marked && ringable(d.value) && (
          <MarkerRing seed={`duel|${d.sym}|${d.value}`} delay={delay + 12} color={accent}
            {...ringSize(d.value, valueFont)} stroke={8} />
        )}
      </div>
      {d.note && (
        <div style={{
          // 링은 글자 높이의 1.45배라 아래로 삐져나온다 — 동그라미 친 쪽만 여백을 준다
          marginTop: marked ? 26 : 10,
          fontFamily, fontSize: noteFont, fontWeight: 900, color: '#FFFFFF',
          letterSpacing: '-0.015em', lineHeight: 1.24, whiteSpace: 'pre-line', ...outline(5),
        }}>{d.note}</div>
      )}
    </div>
  );
}

/**
 * ★ 대결 값의 색 — «부호»가 우선이다. 좌/우 위치가 아니다.
 * ⚠️ 2026-08-13 실측 결함: 좌=민트/우=코랄로 고정했더니 `-1.13%`가 초록으로,
 *    `+0.46%`가 빨강으로 나갔다. 「상승=민트·하락=코랄」은 전 표면 공통 규칙이다.
 *    부호가 없는 값($91.9M, 79%)일 때만 좌/우로 대비를 준다.
 */
function duelColor(value: string, side: 'a' | 'b') {
  const t = value.trim();
  if (t.startsWith('-') || t.startsWith('−')) return K.coral;
  if (t.startsWith('+')) return K.mint;
  return side === 'a' ? K.mint : K.coral;
}

function VisDuel({ v, w, accent }: { v: Extract<CasualVisual, { kind: 'duel' }>; w: number; accent: string }) {
  const vs = usePop(9, 12);
  const sideW = Math.floor((w - 104 - 16) / 2);   // VS 배지(104) + 좌우 간격(8×2)
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <DuelSide d={v.a} col={duelColor(v.a.value, 'a')} delay={2} marked={v.mark === 'a'} accent={accent} sideW={sideW} />
        <div style={{
          opacity: vs.o, transform: `scale(${vs.s}) rotate(-7deg)`, flexShrink: 0,
          fontFamily, fontSize: 52, fontWeight: 900, color: '#0A0D14',
          background: K.pop, borderRadius: 999, width: 104, height: 104,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
        }}>VS</div>
        <DuelSide d={v.b} col={duelColor(v.b.value, 'b')} delay={6} marked={v.mark === 'b'} accent={accent} sideW={sideW} />
      </div>
      {v.caption && (
        <div style={{
          marginTop: 30, textAlign: 'center', opacity: useIn(20, 12),
          fontFamily, fontSize: fitFont(v.caption, w - 20, 32, 32, 20), fontWeight: 900,
          color: K.ink, letterSpacing: '-0.02em', whiteSpace: 'nowrap', ...outline(6),
        }}>{v.caption}</div>
      )}
    </div>
  );
}

function StepRow({ it, i, accent, w, bullet, rowH }: {
  it: { n: string; t: string; v?: string }; i: number; accent: string;
  w: number; bullet: number; rowH: number;
}) {
  const { o, s } = usePop(2 + i * 9, 12);
  const valW = it.v ? 200 : 0;
  // 2줄까지 허용하되(문장이라 감겨도 읽힌다) 칸 높이를 넘지 않게 폰트를 깎는다
  const textFont = Math.min(42, Math.max(26, Math.floor(
    Math.min(rowH / 1.2, ((w - bullet - 22 - valW - 20) * 2) / textUnits(it.t))
  )));
  return (
    <div style={{
      opacity: o, transform: `scale(${s})`, transformOrigin: 'left center',
      display: 'flex', alignItems: 'center', gap: 22,
    }}>
      <div style={{
        flexShrink: 0, width: bullet, height: bullet, borderRadius: 999, background: accent,
        color: '#0A0D14', fontFamily, fontSize: Math.round(bullet * 0.54), fontWeight: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `rotate(${i % 2 ? 3 : -3}deg)`, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}>{it.n}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily, fontSize: textFont, fontWeight: 900, color: K.ink, letterSpacing: '-0.03em',
          lineHeight: 1.16, textShadow: `0 3px 16px ${K.shadow}`, ...outline(Math.round(textFont * 0.19)),
        }}>{it.t}</div>
      </div>
      {it.v && (
        <div style={{
          flexShrink: 0, fontFamily, fontSize: fitFont(it.v, valW, 50, 50, 28), fontWeight: 900,
          color: K.pop, letterSpacing: '-0.035em', whiteSpace: 'nowrap', ...outline(8),
        }}>{it.v}</div>
      )}
    </div>
  );
}

function VisSteps({ v, w, h, accent }: {
  v: Extract<CasualVisual, { kind: 'steps' }>; w: number; h: number; accent: string;
}) {
  const n = v.items.length || 1;
  const gap = 24;
  // 줄이 몇 개든 «칸 안»에 들어오게. 지금은 3개뿐이지만 대본이 5개를 넣어도 안 넘친다.
  const rowH = (h - gap * (n - 1)) / n;
  const bullet = Math.min(74, Math.round(rowH * 0.78));
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap }}>
      {v.items.map((it, i) => (
        <StepRow key={it.n} it={it} i={i} accent={accent} w={w} bullet={bullet} rowH={rowH} />
      ))}
    </div>
  );
}

function VisMeter({ v, w, h, accent }: {
  v: Extract<CasualVisual, { kind: 'meter' }>; w: number; h: number; accent: string;
}) {
  const fill = useIn(4, 22);
  const { o, s } = usePop(2, 13);
  const z = v.zones ?? ['LOW', 'MID', 'HIGH'];
  // 라벨(44) + 값(+링 여백) + 여백(26) + 바(30) + 존라벨(37) 이 h 안에
  const ring = ringable(v.display);
  const avail = h - 44 - 26 - 30 - 37 - 10;
  const valueFont = Math.min(
    fitFont(v.display, w - 52, 999, 150),
    Math.floor(ring ? avail / 1.45 : avail),
  );
  const pad = ring ? Math.round(valueFont * 0.27) : 0;   // 링 반경 0.225 + 획 두께 여유
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: o }}>
      <div style={{ fontFamily, fontSize: fitFont(v.label, w - 20, 30, 30, 20), fontWeight: 900, color: '#FFFFFF', letterSpacing: '0.05em', marginBottom: 14 + pad, whiteSpace: 'nowrap', ...outline(6) }}>{v.label}</div>
      <div style={{ position: 'relative', display: 'inline-block', alignSelf: 'flex-start', marginBottom: 26 + pad }}>
        <span style={{
          fontFamily, fontSize: valueFont, lineHeight: 1, fontWeight: 900, color: K.ink,
          letterSpacing: '-0.055em', padding: '0 16px', display: 'inline-block',
          transform: `scale(${s})`, transformOrigin: 'left center', whiteSpace: 'nowrap',
          textShadow: `0 8px 34px ${K.shadow}`, ...outline(Math.max(6, Math.round(valueFont * 0.073))),
        }}>{v.display}</span>
        {ring && <MarkerRing seed={`meter|${v.display}`} delay={14} color={accent}
          {...ringSize(v.display, valueFont)} stroke={9} />}
      </div>
      <div style={{ height: 30, borderRadius: 999, background: 'rgba(255,255,255,0.16)', overflow: 'hidden', position: 'relative' }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, v.value)) * fill}%`, height: '100%', borderRadius: 999,
          background: `linear-gradient(90deg, ${K.mint}, ${K.pop} 55%, ${K.coral})`,
        }} />
      </div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontFamily, fontSize: 25, fontWeight: 800, color: 'rgba(255,255,255,0.7)' }}>
        <span>{z[0]}</span><span>{z[1]}</span><span>{z[2]}</span>
      </div>
    </div>
  );
}

/** Briefing 계열 시각 — 카드를 벗기고 «줄»로 다시 그린다 */
function VisStack({ rows, w, h, accent }: {
  rows: Array<{ k: string; v: string; up: boolean; note?: string; sym?: string }>;
  w: number; h: number; accent: string;
}) {
  const n = rows.length || 1;
  const gap = 20;
  const rowH = (h - gap * (n - 1)) / n;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap }}>
      {rows.map((r, i) => <StackRow key={r.k + i} r={r} i={i} w={w} rowH={rowH} />)}
    </div>
  );
}

function StackRow({ r, i, w, rowH }: {
  r: { k: string; v: string; up: boolean; note?: string; sym?: string }; i: number;
  w: number; rowH: number;
}) {
  const { o, s } = usePop(2 + i * 8, 12);
  const noteH = r.note ? 30 : 0;
  const cap = Math.max(28, Math.floor((rowH - noteH - 14) * 0.82));
  // 라벨과 값이 «한 줄 안»에서 만나야 한다 — 둘 다 칸 폭을 나눠 갖는다
  const valFont = Math.min(60, cap, fitFont(r.v, w * 0.42, 60, 60, 30));
  const keyFont = Math.min(46, cap, fitFont(r.k, w * 0.5 - SYM.chip, 46, 46, 26));
  return (
    <div style={{
      opacity: o, transform: `scale(${s})`, transformOrigin: 'left center',
      borderBottom: '2px solid rgba(255,255,255,0.16)', paddingBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <TickerMark t={r.sym ?? r.k} size={SYM.chip} />
        <span style={{ fontFamily, fontSize: keyFont, fontWeight: 900, color: K.ink, letterSpacing: '-0.03em', whiteSpace: 'nowrap', ...outline(8) }}>{r.k}</span>
        <span style={{
          marginLeft: 'auto', fontFamily, fontSize: valFont, fontWeight: 900,
          color: r.up ? K.mint : K.coral, letterSpacing: '-0.04em', whiteSpace: 'nowrap', ...outline(9),
        }}>{r.v}</span>
      </div>
      {r.note && (
        <div style={{ marginTop: 4, fontFamily, fontSize: fitFont(r.note, w - 20, 25, 25, 17), fontWeight: 900, color: '#FFFFFF', whiteSpace: 'nowrap', ...outline(5) }}>{r.note}</div>
      )}
    </div>
  );
}

function Vis({ v, w, h, accent }: { v: AnyVisual; w: number; h: number; accent: string }) {
  switch (v.kind) {
    case 'punch': return <VisPunch v={v} w={w} h={h} accent={accent} />;
    case 'duel': return <VisDuel v={v} w={w} accent={accent} />;
    case 'steps': return <VisSteps v={v} w={w} h={h} accent={accent} />;
    case 'meter': return <VisMeter v={v} w={w} h={h} accent={accent} />;
    case 'rows': return <VisStack rows={v.rows} w={w} h={h} accent={accent} />;
    case 'logos': return <VisStack rows={v.items.map((it) => ({ k: it.t, v: it.pct, up: it.up, sym: it.t }))} w={w} h={h} accent={accent} />;
    case 'stat': return <VisPunch v={{ kind: 'punch', value: v.value, label: v.label, sub: v.sub, up: v.up, sym: v.sym }} w={w} h={h} accent={accent} />;
    case 'versus': return <VisDuel v={{
      kind: 'duel',
      a: { sym: v.aSym ?? v.aK, name: v.aK, value: v.aV },
      b: { sym: v.bSym ?? v.bK, name: v.bK, value: v.bV },
      mark: 'none',
    }} w={w} accent={accent} />;
    case 'shot': return <VisShot v={v} w={w} h={h} />;
    default: return null;
  }
}

function VisShot({ v, w, h }: { v: { kind: 'shot'; src: string; focus: ShotFocus; callout?: ShotCallout }; w: number; h: number }) {
  const p = useIn(2, 12), r = useIn(40, 12);
  return (
    <div style={{ opacity: p, height: '100%', display: 'flex', alignItems: 'center' }}>
      <AppShot src={v.src} focus={v.focus} callout={v.callout} calloutOpacity={r} width={w} height={h} />
    </div>
  );
}

// ── props ───────────────────────────────────────────────────────────────────
// BriefingProps 를 그대로 받는다. 캐주얼 전용 필드는 전부 optional 이라
// 같은 대본을 두 템플릿에 «그대로» 꽂아 비교할 수 있다.
export interface CasualProps extends Omit<BriefingProps, 'beats'> {
  track?: Track;
  beats: Array<Beat & { cv?: CasualVisual }>;
  /**
   * ★ 「완주율 사냥」 모드 (2026-08-13 · 실측에서 역산한 설계)
   *
   * 유튜브 쇼츠는 3단계 관문이다: 씨앗 배포(100~1000명) → 반응 측정 → 확대.
   * 확대 기준은 **계속 시청 70%**. 우리 실측은 **16.9%** — 기준의 1/4이라 1단계에서 멈춘다.
   *
   * 그런데 완주율은 «시청 시간 ÷ 영상 길이»다. 분자(시청 13초)를 못 올리면
   * **분모(길이)를 줄이면 된다.** 같은 시청 행동에서:
   *     38초 → 34%   ·   24초 → 54%   ·   **18초 → 72%** ← 기준 통과
   *
   * lean 이 하는 일:
   *   ① prio 1 비트만, 그것도 창에 들어갈 만큼만 (leanCut)
   *   ② **CTA 시퀀스를 통째로 뺀다** — 18초 영상에서 CTA 2.3초는 13%다. 사치다.
   *   ③ 루프백을 1.4초로 줄인다
   * 잃는 것: 앱 소개 한 컷. 얻는 것: 확대 관문 통과 가능성.
   */
  lean?: boolean;
  /**
   * ★ 훅을 «낭독 길이에 딱» 맞춘다 (2026-08-13 실측 결함).
   * 기본 규칙은 `hookSec = max(3.0, 낭독+0.25)` 다. 훅 낭독이 1.5초면 **1.5초가 통째로
   * 무음**이 된다 — 하필 그 구간이 스와이프 판정이 끝나는 자리다.
   * 실측(원유편): 1.1~1.8초 RMS<0.02. 화면도 1.6초까지 정지. 판정 구간에 아무 일도 없었다.
   * true 면 3.0초 하한을 버리고 낭독을 따른다 → 무음 0, 첫 컷이 당겨진다.
   */
  hookTight?: boolean;
}

/** 훅 길이만 CasualProps 규칙으로 다시 계산 (나머지는 Briefing.timingOf 그대로) */
function casualTiming(p: CasualProps) {
  const t = timingOf(p as unknown as BriefingProps);
  const hookSec = p.hookTight && p.voice?.hook ? p.voice.hook.sec + 0.25 : t.hookSec;
  // lean = CTA 제거 + 루프 1.4초. 18초짜리에서 CTA 2.3초는 전체의 13%다.
  if (p.lean) return { ...t, hookSec, ctaSec: 0, loopSec: 1.4 };
  return { ...t, hookSec };
}

const bgOf = (b: Beat): BackdropSpec =>
  typeof b.bg === 'string' ? { kind: 'img', src: b.bg } : (b.bg ?? BACKDROP_FOR[b.role]);

// ── 본체 ────────────────────────────────────────────────────────────────────
export const Casual: React.FC<CasualProps> = (p) => {
  const { durationInFrames } = useVideoConfig();
  const PAD = 46;
  const accent = TRACK_COLOR[p.track ?? 'stock'];

  // 제목 띠(0~420) 아래에 스티커+헤드(450~640), 그 아래가 시각 구역.
  const VIS_TOP = 664;
  const CAP_TOP = 1056;
  const VIS_H = CAP_TOP - VIS_TOP - 12;
  const VIS_W = CANVAS.w - PAD * 2;

  const T = casualTiming(p);
  const hookF = F(T.hookSec);
  const loopF = F(T.loopSec);

  let cursor = hookF;
  const spans = p.beats.map((b, i) => {
    const from = cursor; const len = F(T.beatSecs[i]); cursor += len;
    return { b, from, len };
  });
  const ctaFrom = cursor;
  const loopFrom = durationInFrames - loopF;
  const ctaLen = Math.max(F(1), loopFrom - ctaFrom);

  const hookBg: BackdropSpec = p.hook.bg
    ? (typeof p.hook.bg === 'string' ? { kind: 'img', src: p.hook.bg } : p.hook.bg)
    : p.hook.role ? BACKDROP_FOR[p.hook.role] : HOOK_BACKDROP;
  const data = p.data ?? {};

  return (
    <AbsoluteFill style={{ background: '#05070C' }}>
      {/* 훅 — 제목 띠가 여기에도 있다. 프레임0 = 썸네일이므로 «제목이 썸네일에 박힌다» */}
      <Sequence durationInFrames={hookF}>
        <Backdrop spec={hookBg} dur={hookF} data={data} />
        <Say2 v={p.voice} seg={p.voice?.hook} />
        <AbsoluteFill style={{ justifyContent: 'center', padding: `0 ${PAD}px`, paddingTop: BAND_H }}>
          <CasualHook {...p.hook} date={p.hook.stamp ?? p.date} accent={accent} />
        </AbsoluteFill>
      </Sequence>

      {/* 비트 */}
      {spans.map(({ b, from, len }, i) => {
        const sg = p.voice?.beats?.[i];
        const askAtF = sg?.saySec ? Math.round((sg.saySec + 0.18) * CANVAS.fps) : undefined;
        const toneA = i % 2 === 0 ? 1 : 1.6;
        const toneB = i % 2 === 0 ? 1.6 : 1;
        const vis = b.cv ?? b.visual;
        return (
          <Sequence key={i} from={from} durationInFrames={len}>
            <Backdrop spec={bgOf(b)} dur={len} data={data} tone={toneA} />
            {/* 캐주얼은 화면이 «비어야» 한다 — TickerField(로고 흩뿌리기)를 쓰지 않는다 */}
            <CutFlash />
            {askAtF !== undefined && askAtF + 6 < len && (
              <Sequence from={askAtF} durationInFrames={len - askAtF}>
                <Backdrop spec={bgOf(b)} dur={len - askAtF} data={data} tone={toneB} />
                <CutFlash />
              </Sequence>
            )}
            <Say2 v={p.voice} seg={p.voice?.beats?.[i]} />
            <CasualHead n={i + 1} eyebrow={b.eyebrow} head={b.head} accent={accent} />
            {vis && (
              <div style={{ position: 'absolute', left: PAD, right: PAD, top: VIS_TOP, height: VIS_H }}>
                <Vis v={vis} w={VIS_W} h={VIS_H} accent={accent} />
              </div>
            )}
            <CasualSay text={b.say} ask={b.ask} askAt={askAtF} accent={accent} saySec={sg?.saySec} />
          </Sequence>
        );
      })}

      {/* CTA — lean 판에서는 통째로 뺀다 (18초에서 2.3초는 13%) */}
      {!p.lean && (
        <Sequence from={ctaFrom} durationInFrames={ctaLen}>
          <Backdrop spec={BACKDROP_FOR.brand} dur={ctaLen} data={data} />
          <Say2 v={p.voice} seg={p.voice?.outro} />
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 60px' }}>
            <CasualCta {...p.outro} accent={accent} />
          </AbsoluteFill>
        </Sequence>
      )}

      {/* 루프백 */}
      <Sequence from={loopFrom} durationInFrames={loopF}>
        <Backdrop spec={hookBg} dur={loopF} data={data} />
        <Say2 v={p.voice} seg={p.voice?.loop} />
        {/* ⚠️ 루프 문장과 앱 배지가 겹쳤다(2026-08-13 실측). 원인: 문장을 «가운데»
            정렬해 두고 배지를 고정 y(1150)에 뒀다 — 문장이 3줄이 되자 배지 자리까지
            내려왔다. → 문장을 띠 바로 아래에 «위 정렬»로 못 박고, 배지는 그 아래에. */}
        <AbsoluteFill style={{ justifyContent: 'flex-start', padding: `0 ${PAD}px`, paddingTop: BAND_H + 56 }}>
          <LoopLine text={p.loop} />
        </AbsoluteFill>
        {!p.lean && <AppPlate fontFamily={fontFamily} top={1120} />}
      </Sequence>

      {/* ══ ★ 이음매 — 마지막 프레임을 «첫 프레임과 똑같이» 만든다 ══════════════
          쇼츠는 자동으로 다시 재생된다. 끝과 시작이 다르면 시청자가 «끝났다»를 알아채고
          스와이프한다. 같으면 이어지는 것처럼 보여 한 바퀴를 더 본다.
          조회수는 «재생/재재생마다» 1로 집계되므로(2025-03-31 개정), 한 바퀴 더 =
          조회수 ×2 이자 시청 시간 ×2 다. 완주율 관문(70%)에 직접 꽂히는 장치.

          구현: 마지막 0.4초에 훅과 «같은 구성»을 새로 마운트한다. 새 Sequence 라
          배경 클립도 자기 0프레임부터 시작해 프레임0과 같은 그림이 된다. */}
      <Sequence from={Math.max(0, durationInFrames - SEAM)} durationInFrames={SEAM}>
        <Backdrop spec={hookBg} dur={SEAM} data={data} />
        <AbsoluteFill style={{ justifyContent: 'center', padding: `0 ${PAD}px`, paddingTop: BAND_H }}>
          <CasualHook {...p.hook} date={p.hook.stamp ?? p.date} accent={accent} />
        </AbsoluteFill>
      </Sequence>

      {/* ★ 고정 제목 띠 — 훅·비트·CTA·루프 «전 구간». 이것이 우리 썸네일이다.
          레퍼런스는 이 띠 하나로 (a)무슨 영상인지 (b)누구 채널인지 (c)언제 것인지를
          영상 내내 답한다. 중간 유입자에게도 3초 안에 전부 전달된다. */}
      <TitleBand title={p.title} date={p.date} accent={accent} />

      {/* ★ 2026-08-16 세이프존 교정 — 하단 브랜드 칩 «삭제»
          실측: 이 칩이 y=1536 에 있었는데, 유튜브 쇼츠 모바일이 바로 그 줄에
          «@SIGNUMHQ» 채널명을 그린다 → 화면에 SIGNUM HQ 가 «두 개» 겹쳐 나왔다.
          게다가 상단 TitleBand 가 이미 로고+SIGNUM HQ 를 영상 내내 보여준다(중복 3회).
          → 하단 칩은 없애는 것이 맞다. 브랜딩 손실 0, 겹침 해소. */}

      {/* 면책 — UI 존(y>1536) 위로 올린다.
          이전 bottom:22 는 y≈1868 이라 유튜브 진행바 아래 깔려 사실상 «표시가 안 됐다». */}
      <div style={{
        position: 'absolute', left: 40, right: 40, bottom: 396,
        textAlign: 'center', pointerEvents: 'none',
        fontFamily, fontSize: 24, fontWeight: 800, letterSpacing: '0.01em',
        color: 'rgba(255,232,107,0.92)', textShadow: '0 2px 10px rgba(0,0,0,0.9)',
      }}>
        {p.disclaimer ?? 'Educational only. Not investment advice. Our read, not a forecast.'}
      </div>
    </AbsoluteFill>
  );
};

function LoopLine({ text }: { text: string }) {
  const { o, s } = usePop(2, 14);
  return (
    <div style={{
      opacity: o, transform: `scale(${s})`, transformOrigin: 'left center',
      fontFamily, fontSize: 78, lineHeight: 1.16, fontWeight: 900, color: K.ink,
      letterSpacing: '-0.042em', whiteSpace: 'pre-line',
      textShadow: `0 6px 32px ${K.shadow}`, ...outline(12),
    }}>{text}</div>
  );
}

// ── 훅 = 썸네일 ─────────────────────────────────────────────────────────────
// 실측 근거(PUBLISH_LOG 2026-08-12): 159회 나온 썸네일은 «2색 + 시끄러움», 죽은
// 것들은 «어두운 사진 + 흰 글자 단색». 그래서 색 블록을 유지한다.
// 다만 Briefing 은 블록이 «가지런히» 쌓여 포스터처럼 보인다 → 캐주얼은 각 블록을
// 서로 다른 각도로 기울여 «손으로 붙인» 느낌을 만든다.
function CasualHook({ line, sub, date, syms, bigNum, accent }: {
  line: string; sub: string; date: string; syms?: string[]; bigNum?: string; accent: string;
}) {
  const a = useIn(0, 5);
  const lines = line.split('\n');
  return (
    <div>
      {syms && syms.length > 0 && (
        <div style={{ marginBottom: 24, display: 'flex' }}>
          <SymbolHero syms={syms} size={SYM.hero} />
        </div>
      )}
      {bigNum && (
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
          <div style={{
            display: 'inline-block', background: accent, color: '#070A11',
            fontFamily, fontSize: 150, lineHeight: 0.98, fontWeight: 900,
            letterSpacing: '-0.055em', padding: '4px 26px 14px', borderRadius: 16,
            boxShadow: '0 16px 54px rgba(0,0,0,0.74)', transform: 'rotate(-2.4deg)',
          }}>{bigNum}</div>
        </div>
      )}
      <div style={{ opacity: a, height: 0, overflow: 'hidden' }}>{date}</div>
      {/* 줄마다 각도를 달리 준다 — «가지런함»이 다큐의 냄새다.
          날짜는 제목 띠가 이미 달고 있으므로 여기선 안 그린다(중복 금지). */}
      {lines.map((ln, i) => (
        <div key={i} style={{
          display: 'block',
          transform: `rotate(${i % 2 === 0 ? -0.9 : 0.7}deg)`,
          transformOrigin: 'left center',
          marginBottom: 8, marginLeft: i % 2 === 0 ? 0 : 14,
        }}>
          <span style={{
            display: 'inline-block',
            background: i === lines.length - 1 && lines.length > 1 ? accent : 'rgba(6,9,16,0.86)',
            color: i === lines.length - 1 && lines.length > 1 ? '#070A11' : K.ink,
            borderRadius: 7, padding: '3px 18px 12px',
            fontFamily, fontSize: syms && syms.length ? 70 : 78, lineHeight: 1.06,
            fontWeight: 900, letterSpacing: '-0.045em',
            boxShadow: '0 10px 34px rgba(0,0,0,0.6)',
          }}>{ln}</span>
        </div>
      ))}
      {/* sub 는 «선택»이다 — 훅의 텍스트 블록 수를 줄이는 판을 만들 수 있어야 한다.
          조사: 피드에서는 첫 1~3초가 새 썸네일이고, 읽을 게 많으면 스크롤한다. */}
      {sub && (
        <div style={{
          marginTop: 12, display: 'inline-block',
          background: K.coral, color: '#0B0E14', borderRadius: 7,
          padding: '8px 18px 13px', transform: 'rotate(-1.1deg)',
          fontFamily, fontSize: 40, fontWeight: 900, letterSpacing: '-0.025em',
          boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
        }}>{sub}</div>
      )}
    </div>
  );
}

function CasualCta({ app, line, ask, accent }: { app: string; line: string; ask: string; accent: string }) {
  // delay 0 — CTA 첫 프레임이 «완전히 빈 화면»이면 검은 깜빡임으로 읽힌다(실측)
  const a = usePop(0, 12), b = usePop(10, 13);
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ opacity: a.o, transform: `scale(${a.s})` }}>
        <Img src={staticFile(LOGO)} style={{ width: 128, height: 128, borderRadius: 32, margin: '0 auto 18px', display: 'block', boxShadow: '0 16px 44px rgba(0,0,0,0.55)' }} />
        {/* ⚠️ 아웃트로 배경(골드 터널)이 밝아 앰버 글자가 씻겼다(2026-08-13 실측).
            본문과 같은 규칙 — 밝은 배경 위 글자는 외곽선이 없으면 안 읽힌다. */}
        <div style={{ fontFamily, fontSize: 74, fontWeight: 900, color: accent, letterSpacing: '-0.04em', ...outline(11) }}>{app}</div>
        <div style={{
          fontFamily, marginTop: 10, fontSize: fitFont(line, 900, 27, 27, 19),
          fontWeight: 900, color: K.ink, whiteSpace: 'nowrap', ...outline(6),
        }}>{line}</div>
        <div style={{
          marginTop: 20, display: 'inline-block', fontFamily, fontSize: 24, fontWeight: 900,
          color: '#0A0E16', background: '#FFFFFF', borderRadius: 999, padding: '12px 34px',
          transform: 'rotate(-1.2deg)',
        }}>FREE · iOS &amp; Android</div>
      </div>
      <div style={{ marginTop: 32, opacity: b.o, transform: `scale(${b.s}) rotate(0.8deg)`, display: 'inline-block' }}>
        <div style={{
          background: accent, borderRadius: 22, padding: '20px 30px 24px',
          boxShadow: '0 14px 40px rgba(0,0,0,0.55)',
        }}>
          <div style={{ fontFamily, fontSize: 46, lineHeight: 1.2, fontWeight: 900, color: '#0A0D14', letterSpacing: '-0.03em', whiteSpace: 'pre-line' }}>{ask}</div>
        </div>
      </div>
    </div>
  );
}

/** 컴포지션 등록용 — Briefing.durationOf 와 같은 계산 */
export function casualDurationOf(p: CasualProps) {
  const T = casualTiming(p);
  const body = T.beatSecs.reduce((a, s) => a + F(s), 0);
  return F(T.hookSec) + body + F(T.ctaSec) + F(T.loopSec);
}
