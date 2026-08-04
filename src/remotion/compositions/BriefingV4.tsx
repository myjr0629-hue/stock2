// ============================================================================
// BriefingV4 — 「SIGNUM 브리핑」 완성본
// ----------------------------------------------------------------------------
// 세 가지를 합쳤다: ①레퍼런스 «원본 파일» 실측 ②숏폼 리텐션 조사 ③우리 자원
//
// ── 레퍼런스 원본 실측 (720×1280 · 63.1s · 컷 10회) ─────────────────────────
//   0~3.5s   커버(사진+제목)  3.5~32s  01~04 스토리  32~49s  05~06 상품
//   49~59s   흰 배경 법적고지  59~63s  브랜드 카드
//   ⇒ **뉴스 형식을 빌린 광고**다. 스토리가 상품으로 흘러 들어간다.
//   ⇒ 밝기 격차 220의 정체 = 뒤쪽 «법적 고지 카드»(한국 금융광고 의무). 디자인 아님.
//   ⇒ 각 컷: 앰버 번호+밑줄 / 작은 아이브로 / **거대 앰버 헤드라인 2줄** / 회색 서브라인
//   ⇒ 차트는 범례·축·데이터라벨·출처가 있는 **리서치 차트**
//
// ── 리텐션 조사 (2026-08-04) ────────────────────────────────────────────────
//   · **커리오시티 루프**: 질문을 던지고 답을 미룬다. 그 «긴장»이 시청시간이다
//   · 첫 2초 즉시 훅 → 리텐션 +19% / 첫 5초 패턴 인터럽트 → +23%
//   · 훅에 온스크린 텍스트 → 시청시간 +18%
//   · **리텐션 루프**: 마지막 프레임이 첫 프레임으로 이어지면 재시청이 일어나고
//     알고리즘이 여러 뷰로 센다. **끝과 시작을 «같이» 설계하라.** ← V1~V3에 없던 것
//   · 30~60초 마케팅 숏폼은 «장애물 → 해결»
//
// ── 그래서 이 영상의 뼈대 ───────────────────────────────────────────────────
//   00  훅     질문을 던지고 답하지 않는다        ← 루프 «열림»
//   01  모순   지수 ↑ / 반도체 ↓  나란히
//   02  증거   낙폭 3종목 (리서치 차트)
//   03  반전   같은 테이프, 정반대 두 상품
//   04  답     우리 앱이 본 것                    ← 루프 «닫힘»
//   05  루프백 첫 컷과 «같은 배경» + 한 줄        ← 처음으로 돌아간다
//
// 컴플라이언스: 관찰형만. 현재/과거 사실. 예측·매수매도·방향 암시 0.
// ============================================================================

import {
  AbsoluteFill, Img, Sequence, interpolate, staticFile,
  useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont();
const FPS = 30;
export const BRIEFING4_DURATION = 40 * FPS;   // 40s — 스토리가 숨쉬면서 리텐션이 버티는 길이

const C = {
  ink: '#FFFFFF',
  head: '#FFAA2B',
  sub: 'rgba(228,236,248,0.78)',
  faint: 'rgba(212,222,238,0.55)',
  up: '#3DE38F',
  down: '#FF5C74',
  panel: 'rgba(7,11,19,0.66)',
  line: 'rgba(255,255,255,0.18)',
};

export interface Briefing4Props {
  hookLine: string;        // 훅 — 질문. 답하지 않는다
  hookSub: string;
  hookBg: string;          // 훅 배경 = 루프백에서 «다시» 쓴다
  loopLine: string;        // 마지막 한 줄 — 첫 컷으로 이어진다
  scenes: Array<{
    bg: string;
    pan: 'in' | 'out' | 'left' | 'right';
    eyebrow: string;
    head: string;
    caption: string;       // 하단 자막 «문장» (무음 시청 85%)
    block?:
      | { kind: 'pair'; aLabel: string; aVal: string; bLabel: string; bVal: string }
      | { kind: 'chart'; title: string; unit: string; series: number[]; marks: Array<{ i: number; text: string }>; source: string }
      | { kind: 'mirror'; aLabel: string; aVal: string; bLabel: string; bVal: string; series: number[] }
      | { kind: 'app'; src: string; focus: { x: number; y: number; w: number }; note: string };
  }>;
  outro: { app: string; line: string; cta: string };
}

const S = (sec: number) => Math.round(sec * FPS);
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const useIn = (d = 0, dur = 15) => interpolate(useCurrentFrame(), [d, d + dur], [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

// ── 배경: 풀블리드 실사 + 켄번스 ────────────────────────────────────────────
function PhotoBg({ src, pan, dur }: { src: string; pan: string; dur: number }) {
  const t = interpolate(useCurrentFrame(), [0, dur], [0, 1], { extrapolateRight: 'clamp' });
  const z = pan === 'in' ? 1.05 + t * 0.11 : pan === 'out' ? 1.18 - t * 0.11 : 1.12;
  const x = pan === 'left' ? -t * 4.5 : pan === 'right' ? t * 4.5 : 0;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#05070C' }}>
      <Img src={staticFile(src)} style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${z}) translateX(${x}%)`,
        filter: 'saturate(0.84) contrast(1.08) brightness(1.02)',
      }} />
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, rgba(4,7,13,0.88) 0%, rgba(4,7,13,0.55) 30%, rgba(4,7,13,0.14) 50%, rgba(4,7,13,0.80) 100%)',
      }} />
    </AbsoluteFill>
  );
}

// ── 하단 자막 — 무음 시청자를 위한 «문장» ───────────────────────────────────
function Caption({ text, delay = 10 }: { text: string; delay?: number }) {
  const p = useIn(delay, 12);
  return (
    <div style={{ position: 'absolute', left: 54, right: 54, bottom: 130, opacity: p }}>
      <div style={{
        display: 'inline-block',
        background: 'linear-gradient(180deg, rgba(24,34,54,0.94), rgba(12,19,34,0.90))',
        border: `1px solid ${C.line}`, borderRadius: 16, padding: '15px 22px',
      }}>
        <div style={{ fontFamily, fontSize: 37, lineHeight: 1.3, fontWeight: 800, color: C.ink, letterSpacing: '-0.015em' }}>
          {text}
        </div>
      </div>
    </div>
  );
}

// ── 상단 타이포 (레퍼런스 구조) ─────────────────────────────────────────────
function TopType({ n, eyebrow, head }: { n: number; eyebrow: string; head: string }) {
  const a = useIn(1, 10), b = useIn(5, 12);
  return (
    <div style={{ position: 'absolute', top: 84, left: 54, right: 54 }}>
      <div style={{ opacity: a, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontFamily, fontSize: 31, fontWeight: 900, color: C.head, letterSpacing: '0.05em' }}>
          {String(n).padStart(2, '0')}
        </span>
        <div style={{ width: 96, height: 3, background: C.head, borderRadius: 2 }} />
        <span style={{ fontFamily, fontSize: 23, fontWeight: 700, color: C.ink }}>{eyebrow}</span>
      </div>
      <div style={{
        marginTop: 14, opacity: b, transform: `translateY(${(1 - b) * 16}px)`,
        fontFamily, fontSize: 72, lineHeight: 1.13, fontWeight: 900,
        color: C.head, letterSpacing: '-0.035em', whiteSpace: 'pre-line',
        textShadow: '0 6px 32px rgba(0,0,0,0.66)',
      }}>{head}</div>
    </div>
  );
}

// ── 리서치 차트 ─────────────────────────────────────────────────────────────
function Chart({ title, unit, series, marks, source }: {
  title: string; unit: string; series: number[]; marks: Array<{ i: number; text: string }>; source: string;
}) {
  const p = useIn(8, 30);
  const W = 900, H = 330, L = 84, B = 40;
  const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
  const px = (i: number) => L + (i / (series.length - 1)) * (W - L - 24);
  const py = (v: number) => (H - B) - ((v - lo) / span) * (H - B - 34);
  const pts = series.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 20, padding: '22px 22px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily, fontSize: 26, fontWeight: 800, color: C.ink }}>{title}</span>
        <span style={{ fontFamily, fontSize: 18, fontWeight: 700, color: C.faint }}>{unit}</span>
      </div>
      <svg width={W} height={H} style={{ display: 'block', marginTop: 8 }}>
        <defs>
          <clipPath id="c4"><rect x="0" y="0" width={W * p} height={H} /></clipPath>
          <linearGradient id="f4" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.down} stopOpacity="0.34" />
            <stop offset="100%" stopColor={C.down} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[lo, lo + span / 2, hi].map((tv, k) => (
          <g key={k}>
            <line x1={L} x2={W - 24} y1={py(tv)} y2={py(tv)} stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
            <text x={L - 12} y={py(tv) + 6} textAnchor="end"
              style={{ fontFamily, fontSize: 18, fontWeight: 700, fill: 'rgba(226,234,246,0.66)' }}>{tv.toFixed(0)}</text>
          </g>
        ))}
        <g clipPath="url(#c4)">
          <polygon points={`${L},${H - B} ${pts} ${W - 24},${H - B}`} fill="url(#f4)" />
          <polyline points={pts} fill="none" stroke={C.down} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
          {marks.map((m) => (
            <g key={m.i}>
              <circle cx={px(m.i)} cy={py(series[m.i])} r="7" fill={C.down} />
              <text x={px(m.i)} y={py(series[m.i]) - 18}
                textAnchor={m.i === 0 ? 'start' : m.i >= series.length - 2 ? 'end' : 'middle'}
                style={{ fontFamily, fontSize: 22, fontWeight: 900, fill: C.ink }}>{m.text}</text>
            </g>
          ))}
        </g>
      </svg>
      <div style={{ fontFamily, fontSize: 16, fontWeight: 600, color: 'rgba(210,220,236,0.5)', marginTop: 2 }}>{source}</div>
    </div>
  );
}

function Pair({ aLabel, aVal, bLabel, bVal }: { aLabel: string; aVal: string; bLabel: string; bVal: string }) {
  const a = useIn(6, 16), b = useIn(16, 16);
  const Box = ({ l, v, col, p }: any) => (
    <div style={{
      flex: 1, background: C.panel, border: `1px solid ${col}55`, borderRadius: 20,
      padding: '26px 24px', opacity: p, transform: `translateY(${(1 - p) * 16}px)`,
    }}>
      <div style={{ fontFamily, fontSize: 22, fontWeight: 800, color: C.faint, letterSpacing: '0.1em' }}>{l}</div>
      <div style={{ fontFamily, fontSize: 78, fontWeight: 900, color: col, letterSpacing: '-0.04em', marginTop: 4 }}>{v}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <Box l={aLabel} v={aVal} col={C.up} p={a} />
      <Box l={bLabel} v={bVal} col={C.down} p={b} />
    </div>
  );
}

function MirrorBars({ aLabel, aVal, bLabel, bVal, series }: any) {
  const a = useIn(6, 18), b = useIn(18, 18);
  const lo = Math.min(...series), hi = Math.max(...series);
  const n = series.map((v: number) => (v - lo) / ((hi - lo) || 1));
  const Row = ({ l, v, col, data, p }: any) => (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 20, padding: '20px 24px', opacity: p }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily, fontSize: 22, fontWeight: 800, color: C.faint, letterSpacing: '0.1em' }}>{l}</span>
        <span style={{ fontFamily, fontSize: 62, fontWeight: 900, color: col, letterSpacing: '-0.035em' }}>{v}</span>
      </div>
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-end', gap: 6, height: 104 }}>
        {data.map((x: number, i: number) => (
          <div key={i} style={{ flex: 1, height: `${12 + x * 88}%`, borderRadius: 3, background: col, opacity: 0.32 + x * 0.58 }} />
        ))}
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Row l={aLabel} v={aVal} col={C.down} data={n} p={a} />
      <Row l={bLabel} v={bVal} col={C.up} data={n.map((x: number) => 1 - x)} p={b} />
    </div>
  );
}

function AppShot({ src, focus, note }: { src: string; focus: { x: number; y: number; w: number }; note: string }) {
  const p = useIn(6, 18);
  const sc = 1 / focus.w;
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 18}px)` }}>
      <div style={{
        width: '100%', height: 330, borderRadius: 22, overflow: 'hidden', position: 'relative',
        border: `1px solid ${C.line}`, boxShadow: '0 24px 66px rgba(0,0,0,0.62)',
      }}>
        <Img src={staticFile(src)} style={{
          position: 'absolute', width: `${sc * 100}%`,
          left: `${-focus.x * sc * 100}%`, top: `${-focus.y * sc * 100}%`,
          filter: 'brightness(1.32) contrast(1.10)',
        }} />
      </div>
      <div style={{ marginTop: 12, fontFamily, fontSize: 24, fontWeight: 900, color: C.head, letterSpacing: '0.04em', textAlign: 'center' }}>
        {note}
      </div>
    </div>
  );
}

// ── 본체 ────────────────────────────────────────────────────────────────────
export const BriefingV4: React.FC<Briefing4Props> = (p) => {
  const HOOK = S(3);
  const OUTRO = S(5);
  const LOOP = S(3);
  const body = BRIEFING4_DURATION - HOOK - OUTRO - LOOP;
  const per = Math.floor(body / p.scenes.length);
  // per 를 내림하면서 생긴 잔여 프레임이 «검은 틈»으로 남는다(실측: 2프레임, 밝기 7.2).
  // 아웃트로를 루프백 시작까지 늘려 틈을 없앤다.
  const outroFrom = HOOK + p.scenes.length * per;
  const loopFrom = BRIEFING4_DURATION - LOOP;
  const outroLen = loopFrom - outroFrom;

  return (
    <AbsoluteFill style={{ background: '#05070C' }}>

      {/* ── 00 훅 (0~3s) — 질문을 던지고 «답하지 않는다». 루프가 열린다 ── */}
      <Sequence durationInFrames={HOOK}>
        <PhotoBg src={p.hookBg} pan="in" dur={HOOK} />
        <AbsoluteFill style={{ justifyContent: 'center', padding: '0 54px 120px' }}>
          <HookText line={p.hookLine} sub={p.hookSub} />
        </AbsoluteFill>
      </Sequence>

      {/* ── 01~04 본문 ── */}
      {p.scenes.map((sc, i) => (
        <Sequence key={i} from={HOOK + i * per} durationInFrames={per}>
          <PhotoBg src={sc.bg} pan={sc.pan} dur={per} />
          <TopType n={i + 1} eyebrow={sc.eyebrow} head={sc.head} />
          {sc.block && (
            <div style={{ position: 'absolute', left: 54, right: 54, bottom: 300 }}>
              {sc.block.kind === 'pair' && <Pair {...sc.block} />}
              {sc.block.kind === 'chart' && <Chart {...sc.block} />}
              {sc.block.kind === 'mirror' && <MirrorBars {...sc.block} />}
              {sc.block.kind === 'app' && <AppShot {...sc.block} />}
            </div>
          )}
          <Caption text={sc.caption} delay={14} />
        </Sequence>
      ))}

      {/* ── 05 아웃트로 ── */}
      <Sequence from={outroFrom} durationInFrames={outroLen}>
        <PhotoBg src="shorts/broll/v25_scene7_outro.png" pan="in" dur={outroLen} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 64px' }}>
          <Fade>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily, fontSize: 78, fontWeight: 900, color: C.head, letterSpacing: '-0.035em', textShadow: '0 6px 32px rgba(0,0,0,0.6)' }}>
                {p.outro.app}
              </div>
              <div style={{ fontFamily, marginTop: 12, fontSize: 28, fontWeight: 700, color: C.ink }}>{p.outro.line}</div>
              <div style={{
                marginTop: 26, display: 'inline-block', fontFamily, fontSize: 25, fontWeight: 900,
                color: '#0A0E16', background: C.head, borderRadius: 999, padding: '14px 40px',
              }}>{p.outro.cta}</div>
            </div>
          </Fade>
        </AbsoluteFill>
      </Sequence>

      {/* ── 06 루프백 — 첫 컷과 «같은 배경». 스크롤 안 하면 처음으로 이어진다 ── */}
      <Sequence from={loopFrom} durationInFrames={LOOP}>
        <PhotoBg src={p.hookBg} pan="in" dur={LOOP} />
        <AbsoluteFill style={{ justifyContent: 'center', padding: '0 54px 120px' }}>
          <Fade>
            <div style={{
              fontFamily, fontSize: 82, lineHeight: 1.16, fontWeight: 900, color: C.ink,
              letterSpacing: '-0.035em', whiteSpace: 'pre-line', textShadow: '0 6px 32px rgba(0,0,0,0.7)',
            }}>{p.loopLine}</div>
          </Fade>
        </AbsoluteFill>
      </Sequence>

      {/* 상시 면책 */}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none' }}>
        <div style={{ fontFamily, marginBottom: 46, fontSize: 19, fontWeight: 700, color: 'rgba(214,224,240,0.7)' }}>
          Informational only. Not investment advice.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 훅 — 첫 2초 안에 텍스트가 «이미» 떠 있어야 한다(조사: 즉시 훅 +19%) */
function HookText({ line, sub }: { line: string; sub: string }) {
  const p = useIn(0, 8);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 14}px)` }}>
      <div style={{
        fontFamily, fontSize: 88, lineHeight: 1.14, fontWeight: 900, color: C.ink,
        letterSpacing: '-0.038em', whiteSpace: 'pre-line', textShadow: '0 6px 32px rgba(0,0,0,0.72)',
      }}>{line}</div>
      <div style={{ marginTop: 18, fontFamily, fontSize: 40, fontWeight: 900, color: C.head, letterSpacing: '-0.02em' }}>
        {sub}
      </div>
    </div>
  );
}

function Fade({ children }: { children: React.ReactNode }) {
  const p = useIn(2, 16);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>{children}</div>;
}
