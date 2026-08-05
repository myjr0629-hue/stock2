// ============================================================================
// kit/Briefing — 「SIGNUM 브리핑」 정본 템플릿
// ----------------------------------------------------------------------------
// 목표(대표 지시): "재가공할 정도의 템플릿. 시간대별로 변경해서 쓰게."
// → 컴포지션을 새로 만들지 않는다. **비트(beat) 배열만 바꾸면** 다른 영상이 된다.
//
// ── 이 파일이 고친 것 (V1~V7의 누적 결함) ──────────────────────────────────
//  ① **자막 위치** — V1~V7은 자막을 «하단»에 뒀다. 조사: 하단 25%는 유튜브
//     좋아요·댓글·공유 버튼이 덮는다. → 안전영역(중앙 1/3) 안으로 올린다.
//  ② **자막 크기** — V7은 36px. 조사 최적 64~88px. → 74px.
//  ③ **줄 길이·노출시간** — 50자·7.8초였다. → 26자·글자수 비례 1.5~3초.
//  ④ **배경이 내용과 무관** — broll 을 순서대로 돌려썼다.
//     → 비트의 «역할(role)»이 배경을 고른다. 대본이 배경을 결정한다.
//  ⑤ **앱 화면 잘림** — components/AppShot(픽셀 계산)만 쓴다.
//
// 수치는 전부 kit/spec.ts 에. 감으로 바꾸지 않는다.
// 컴플라이언스: 관찰형만. 액션 요구 0. 예측·매수매도 0.
// ============================================================================

import {
  AbsoluteFill, Img, Sequence, interpolate, staticFile,
  useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { AppShot, type ShotFocus, type ShotBox } from '../components/AppShot';
import { CANVAS, SAFE, CAPTION, PACE, C, BG_FOR, type BeatRole } from './spec';

const { fontFamily } = loadFont();
const F = (s: number) => Math.round(s * CANVAS.fps);
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const useIn = (d = 0, dur = 10) => interpolate(useCurrentFrame(), [d, d + dur], [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

// ── 비트 = 영상의 최소 단위 ────────────────────────────────────────────────
export type Visual =
  | { kind: 'stat'; label: string; value: string; sub: string; up: boolean }
  | { kind: 'versus'; aK: string; aV: string; bK: string; bV: string }
  | { kind: 'rows'; rows: Array<{ k: string; v: string; up: boolean; note?: string }> }
  | { kind: 'logos'; items: Array<{ t: string; pct: string; up: boolean }> }
  | { kind: 'source'; outlet: string; at: string; headline: string; body?: string }
  | { kind: 'shot'; src: string; focus: ShotFocus; box?: ShotBox }
  | { kind: 'chart'; series: number[]; label: string; value: string; pct: string; up: boolean };

export interface Beat {
  role: BeatRole;
  /** 상단 앰버 헤드라인. \n 으로 2줄 */
  head: string;
  /** 작은 흰 아이브로 */
  eyebrow?: string;
  /** ★ 자막 = 대본 그대로. ElevenLabs 가 읽을 문장과 «같은 문자열» */
  say: string;
  /** ★ 답하지 않는 질문 — 답은 다음 비트에 (연쇄 커리오시티 루프) */
  ask?: string;
  visual?: Visual;
  /** 길이. 없으면 role 로 자동 */
  sec?: number;
  /** 배경 덮어쓰기. 없으면 role 이 고른다 */
  bg?: string;
}

export interface BriefingProps {
  /** 고정 배너 훅 제목 — 중간 유입자도 3초 안에 뭘 보는지 알게 */
  title: string;
  date: string;
  hook: { line: string; sub: string; role?: BeatRole };
  beats: Beat[];
  outro: { app: string; line: string; ask: string };
  /** 마지막이 첫 화면으로 이어지는 루프백 문장 */
  loop: string;
}

const secFor = (b: Beat) =>
  b.sec ?? (b.visual?.kind === 'shot' || b.visual?.kind === 'source' ? PACE.proofSec : PACE.beatSec);

// ── 배경 ────────────────────────────────────────────────────────────────────
function Bg({ src, dur }: { src: string; dur: number }) {
  const t = interpolate(useCurrentFrame(), [0, dur], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#05070C' }}>
      <Img src={staticFile(src)} style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${1.05 + t * 0.09})`,
        filter: 'saturate(0.82) contrast(1.06) brightness(1.02)',
      }} />
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, rgba(4,7,13,0.86) 0%, rgba(4,7,13,0.40) 24%, rgba(4,7,13,0.28) 52%, rgba(4,7,13,0.82) 100%)',
      }} />
    </AbsoluteFill>
  );
}

// ── 고정 배너 (제목 + 날짜) ─────────────────────────────────────────────────
function Banner({ title, date }: { title: string; date: string }) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40 }}>
      <div style={{
        background: 'linear-gradient(180deg, rgba(11,18,32,0.97), rgba(8,13,24,0.92))',
        borderBottom: `2px solid ${C.head}`, padding: '24px 40px 16px',
      }}>
        <div style={{ fontFamily, fontSize: 44, lineHeight: 1.14, fontWeight: 900, color: C.head, letterSpacing: '-0.03em', whiteSpace: 'pre-line' }}>
          {title}
        </div>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily, fontSize: 21, fontWeight: 800, color: C.ink }}>SIGNUM HQ</span>
          <span style={{ fontFamily, fontSize: 21, fontWeight: 800, color: C.faint }}>{date}</span>
        </div>
      </div>
    </div>
  );
}

// ── 자막 — ★ 안전영역 안, 74px, 26자 2줄 ───────────────────────────────────
function Say({ text, ask }: { text: string; ask?: string }) {
  const p = useIn(0, 6);          // 조사: 오디오보다 0.1~0.3초 먼저
  const q = useIn(22, 9);
  const lines = CAPTION.wrap(text);
  return (
    <div style={{
      position: 'absolute', left: 44, right: 44,
      // ★ 하단이 아니라 «안전영역 하단» 위. 유튜브 버튼에 안 가린다.
      bottom: CANVAS.h - SAFE.bottom + 24,
    }}>
      <div style={{
        opacity: p, transform: `translateY(${(1 - p) * 12}px)`,
        background: C.capBg, border: `1px solid ${C.line}`, borderRadius: 18,
        padding: '20px 26px', backdropFilter: 'blur(4px)',
      }}>
        {lines.map((l, i) => (
          <div key={i} style={{
            fontFamily, fontSize: CAPTION.sizeFor(lines.length), lineHeight: CAPTION.lineHeight,
            fontWeight: 900, color: C.ink, letterSpacing: '-0.025em',
          }}>{l}</div>
        ))}
      </div>
      {ask && (
        <div style={{
          marginTop: 12, opacity: q, transform: `translateY(${(1 - q) * 10}px)`,
          background: 'rgba(255,176,32,0.16)', border: `2px solid ${C.head}`,
          borderRadius: 16, padding: '16px 22px',
        }}>
          {CAPTION.wrap(ask).map((l, i, arr) => (
            <div key={i} style={{
              fontFamily, fontSize: arr.length > 2 ? 44 : 52, lineHeight: 1.2, fontWeight: 900,
              color: C.head, letterSpacing: '-0.025em',
            }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 상단 타이포 ─────────────────────────────────────────────────────────────
function Head({ n, eyebrow, head }: { n: number; eyebrow?: string; head: string }) {
  const a = useIn(1, 8), b = useIn(4, 10);
  return (
    <div style={{ position: 'absolute', top: SAFE.top - 210, left: 44, right: 44 }}>
      <div style={{ opacity: a, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily, fontSize: 27, fontWeight: 900, color: C.head, letterSpacing: '0.05em' }}>
          {String(n).padStart(2, '0')}
        </span>
        <div style={{ width: 72, height: 3, background: C.head, borderRadius: 2 }} />
        {eyebrow && <span style={{ fontFamily, fontSize: 21, fontWeight: 700, color: C.ink }}>{eyebrow}</span>}
      </div>
      <div style={{
        marginTop: 10, opacity: b, transform: `translateY(${(1 - b) * 12}px)`,
        fontFamily, fontSize: 62, lineHeight: 1.12, fontWeight: 900, color: C.head,
        letterSpacing: '-0.035em', whiteSpace: 'pre-line', textShadow: '0 6px 28px rgba(0,0,0,0.72)',
      }}>{head}</div>
    </div>
  );
}

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{
    background: C.panel, border: `1px solid ${C.line}`, borderRadius: 22,
    padding: '22px 26px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)', ...style,
  }}>{children}</div>
);

// ── 시각 블록들 ─────────────────────────────────────────────────────────────
function Vis({ v, w, h }: { v: Visual; w: number; h: number }) {
  const p = useIn(3, 12);
  const box: React.CSSProperties = { opacity: p, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 };

  if (v.kind === 'stat') return (
    <div style={box}><Card style={{ padding: '28px 30px' }}>
      <div style={{ fontFamily, fontSize: 23, fontWeight: 800, color: C.faint, letterSpacing: '0.1em' }}>{v.label}</div>
      <div style={{ fontFamily, fontSize: 96, fontWeight: 900, color: v.up ? C.cool : C.hot, letterSpacing: '-0.045em', lineHeight: 1.04 }}>{v.value}</div>
      <div style={{ fontFamily, fontSize: 25, fontWeight: 700, color: C.ink, marginTop: 2 }}>{v.sub}</div>
    </Card></div>
  );

  if (v.kind === 'versus') {
    const B = ({ k, val, col, d }: any) => {
      const q = useIn(d, 12);
      return (
        <Card style={{ flex: 1, opacity: q, padding: '24px 22px' }}>
          <div style={{ fontFamily, fontSize: 20, fontWeight: 800, color: C.faint, letterSpacing: '0.08em' }}>{k}</div>
          <div style={{ fontFamily, fontSize: 58, fontWeight: 900, color: col, letterSpacing: '-0.04em', lineHeight: 1.1, marginTop: 4 }}>{val}</div>
        </Card>
      );
    };
    return <div style={{ ...box, flexDirection: 'row', alignItems: 'center' }}>
      <B k={v.aK} val={v.aV} col={C.cool} d={3} /><B k={v.bK} val={v.bV} col={C.hot} d={11} />
    </div>;
  }

  if (v.kind === 'rows') return (
    <div style={box}>{v.rows.map((r, i) => {
      const q = useIn(3 + i * 7, 12);
      return (
        <Card key={r.k} style={{ opacity: q, transform: `translateX(${(1 - q) * -14}px)`, padding: '20px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily, fontSize: 46, fontWeight: 900, color: C.ink, letterSpacing: '-0.025em' }}>{r.k}</span>
            <span style={{ fontFamily, fontSize: 50, fontWeight: 900, color: r.up ? C.cool : C.hot, letterSpacing: '-0.03em' }}>{r.v}</span>
          </div>
          {r.note && <div style={{ marginTop: 4, fontFamily, fontSize: 21, fontWeight: 700, color: C.faint }}>{r.note}</div>}
        </Card>
      );
    })}</div>
  );

  if (v.kind === 'logos') return (
    <div style={box}>{v.items.map((it, i) => {
      const q = useIn(3 + i * 7, 12);
      return (
        <Card key={it.t} style={{ opacity: q, transform: `translateX(${(1 - q) * -14}px)`, padding: '18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 78, height: 78, borderRadius: 18, background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Img src={staticFile(`shorts/logos/${it.t}.png`)} style={{ width: 56, height: 56, objectFit: 'contain' }} />
            </div>
            <span style={{ fontFamily, fontSize: 46, fontWeight: 900, color: C.ink, letterSpacing: '-0.02em' }}>{it.t}</span>
            <span style={{ marginLeft: 'auto', fontFamily, fontSize: 50, fontWeight: 900, color: it.up ? C.cool : C.hot, letterSpacing: '-0.03em' }}>{it.pct}</span>
          </div>
        </Card>
      );
    })}</div>
  );

  if (v.kind === 'source') return (
    <div style={box}><Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontFamily, fontSize: 17, fontWeight: 900, color: '#0A0E16', background: C.hot, borderRadius: 6, padding: '4px 10px', letterSpacing: '0.08em' }}>SOURCE</span>
        <span style={{ fontFamily, fontSize: 19, fontWeight: 700, color: C.faint }}>{v.outlet} · {v.at}</span>
      </div>
      <div style={{ fontFamily, fontSize: 36, lineHeight: 1.24, fontWeight: 900, color: C.ink, letterSpacing: '-0.02em' }}>{v.headline}</div>
      {v.body && <div style={{ marginTop: 10, fontFamily, fontSize: 24, lineHeight: 1.4, fontWeight: 600, color: 'rgba(224,234,248,0.86)' }}>{v.body}</div>}
    </Card></div>
  );

  if (v.kind === 'chart') {
    const d = useIn(6, 26);
    const W = w, H = Math.min(300, h - 140), B = 14;
    const lo = Math.min(...v.series), hi = Math.max(...v.series), sp = hi - lo || 1;
    const pts = v.series.map((x, i) => `${((i / (v.series.length - 1)) * W).toFixed(1)},${((H - B) - ((x - lo) / sp) * (H - B - 20)).toFixed(1)}`).join(' ');
    const col = v.up ? C.cool : C.hot;
    return (
      <div style={box}><Card>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily, fontSize: 21, fontWeight: 800, color: C.faint, letterSpacing: '0.1em' }}>{v.label}</div>
            <div style={{ fontFamily, fontSize: 62, fontWeight: 900, color: C.ink, letterSpacing: '-0.04em' }}>{v.value}</div>
          </div>
          <div style={{ fontFamily, fontSize: 52, fontWeight: 900, color: col, letterSpacing: '-0.035em' }}>{v.pct}</div>
        </div>
        <div style={{ marginTop: 12, clipPath: `inset(0 ${(1 - d) * 100}% 0 0)` }}>
          <svg width={W - 52} height={H} style={{ display: 'block' }}>
            <polyline points={pts} fill="none" stroke={col} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
      </Card></div>
    );
  }

  // shot
  const r = useIn(14, 10);
  return (
    <div style={{ opacity: p, height: '100%', display: 'flex', alignItems: 'center' }}>
      <AppShot src={v.src} focus={v.focus} box={v.box} boxOpacity={r} width={w} height={h} />
    </div>
  );
}

// ── 본체 ────────────────────────────────────────────────────────────────────
export const Briefing: React.FC<BriefingProps> = (p) => {
  const { durationInFrames } = useVideoConfig();
  const PAD = 44;
  const VIS_TOP = SAFE.top + 16;
  // 자막 실측 높이: 본문 2줄(74*1.22*2=180) + 패딩 40 + 질문(2줄 52*1.2=125 + 패딩 32 + 여백 12)
  const CAP_BLOCK_H = 180 + 40 + 125 + 32 + 12;   // 389
  const CAP_TOP = SAFE.bottom - 24 - CAP_BLOCK_H;
  const VIS_H = Math.max(320, CAP_TOP - VIS_TOP - 20);
  const VIS_W = CANVAS.w - PAD * 2;

  const hookF = F(PACE.hookSec);
  const loopF = F(PACE.loopSec);
  const ctaF = F(PACE.ctaSec);

  let cursor = hookF;
  const spans = p.beats.map((b) => {
    const from = cursor; const len = F(secFor(b)); cursor += len;
    return { b, from, len };
  });
  const ctaFrom = cursor;
  const loopFrom = durationInFrames - loopF;
  const ctaLen = Math.max(F(1), loopFrom - ctaFrom);

  const hookBg = BG_FOR[p.hook.role ?? 'market'];

  return (
    <AbsoluteFill style={{ background: '#05070C' }}>
      {/* 훅 */}
      <Sequence durationInFrames={hookF}>
        <Bg src={hookBg} dur={hookF} />
        <AbsoluteFill style={{ justifyContent: 'center', padding: `0 ${PAD}px`, paddingTop: 120 }}>
          <HookBlock line={p.hook.line} sub={p.hook.sub} date={p.date} />
        </AbsoluteFill>
      </Sequence>

      {/* 비트 */}
      {spans.map(({ b, from, len }, i) => (
        <Sequence key={i} from={from} durationInFrames={len}>
          <Bg src={b.bg ?? BG_FOR[b.role]} dur={len} />
          <Head n={i + 1} eyebrow={b.eyebrow} head={b.head} />
          {b.visual && (
            <div style={{ position: 'absolute', left: PAD, right: PAD, top: VIS_TOP, height: VIS_H }}>
              <Vis v={b.visual} w={VIS_W} h={VIS_H} />
            </div>
          )}
          <Say text={b.say} ask={b.ask} />
        </Sequence>
      ))}

      {/* CTA */}
      <Sequence from={ctaFrom} durationInFrames={ctaLen}>
        <Bg src={BG_FOR.brand} dur={ctaLen} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 60px' }}>
          <CtaBlock {...p.outro} />
        </AbsoluteFill>
      </Sequence>

      {/* 루프백 — 첫 화면으로 이어진다 */}
      <Sequence from={loopFrom} durationInFrames={loopF}>
        <Bg src={hookBg} dur={loopF} />
        <AbsoluteFill style={{ justifyContent: 'center', padding: `0 ${PAD}px`, paddingTop: 120 }}>
          <Rise><div style={{
            fontFamily, fontSize: 78, lineHeight: 1.16, fontWeight: 900, color: C.ink,
            letterSpacing: '-0.035em', whiteSpace: 'pre-line', textShadow: '0 6px 30px rgba(0,0,0,0.74)',
          }}>{p.loop}</div></Rise>
        </AbsoluteFill>
      </Sequence>

      <Banner title={p.title} date={p.date} />

      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none' }}>
        <div style={{ fontFamily, marginBottom: 26, fontSize: 18, fontWeight: 700, color: 'rgba(214,224,240,0.62)' }}>
          Informational only. Not investment advice.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

function HookBlock({ line, sub, date }: { line: string; sub: string; date: string }) {
  const a = useIn(0, 6), b = useIn(3, 9);
  return (
    <div>
      <div style={{
        display: 'inline-block', opacity: a, marginBottom: 18,
        fontFamily, fontSize: 24, fontWeight: 900, color: '#0A0E16',
        background: C.head, borderRadius: 8, padding: '8px 16px', letterSpacing: '0.06em',
      }}>{date}</div>
      <div style={{
        opacity: b, transform: `translateY(${(1 - b) * 12}px)`,
        fontFamily, fontSize: 84, lineHeight: 1.12, fontWeight: 900, color: C.ink,
        letterSpacing: '-0.038em', whiteSpace: 'pre-line', textShadow: '0 6px 30px rgba(0,0,0,0.76)',
      }}>{line}</div>
      <div style={{ marginTop: 16, opacity: b, fontFamily, fontSize: 44, fontWeight: 900, color: C.head, letterSpacing: '-0.025em' }}>{sub}</div>
    </div>
  );
}

function CtaBlock({ app, line, ask }: { app: string; line: string; ask: string }) {
  const a = useIn(2, 12), b = useIn(12, 12);
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ opacity: a }}>
        <div style={{ fontFamily, fontSize: 72, fontWeight: 900, color: C.head, letterSpacing: '-0.035em' }}>{app}</div>
        <div style={{ fontFamily, marginTop: 10, fontSize: 26, fontWeight: 700, color: C.ink }}>{line}</div>
        <div style={{ marginTop: 20, display: 'inline-block', fontFamily, fontSize: 24, fontWeight: 900, color: '#0A0E16', background: C.head, borderRadius: 999, padding: '12px 34px' }}>
          FREE · iOS &amp; Android
        </div>
      </div>
      <div style={{ marginTop: 30, opacity: b, background: 'rgba(255,176,32,0.16)', border: `2px solid ${C.head}`, borderRadius: 18, padding: '20px 26px' }}>
        <div style={{ fontFamily, fontSize: 46, lineHeight: 1.22, fontWeight: 900, color: C.head, letterSpacing: '-0.025em', whiteSpace: 'pre-line' }}>{ask}</div>
      </div>
    </div>
  );
}

function Rise({ children }: { children: React.ReactNode }) {
  const p = useIn(2, 12);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>{children}</div>;
}

/** 대본 길이에서 총 프레임을 계산 — 컴포지션 등록 시 사용 */
export function durationOf(p: BriefingProps) {
  const body = p.beats.reduce((a, b) => a + F(secFor(b)), 0);
  return F(PACE.hookSec) + body + F(PACE.ctaSec) + F(PACE.loopSec);
}
