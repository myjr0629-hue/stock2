// ============================================================================
// BriefingV5 — 「SIGNUM 브리핑」 뉴스 연동판
// ----------------------------------------------------------------------------
// 대표 지적 (2026-08-04, V4를 보고):
//   ① 실제 앱 화면이 잘린다                    → 블록 영역을 명시적으로 잡고 높이 계산
//   ② 처음에 «날짜»가 중요하다. 언제 뉴스인지  → 훅에 날짜·시각 배지
//   ③ 중간 공간을 너무 비워놓고 있다            → 상단/하단만 쓰던 걸 «중앙까지» 채운다
//   ④ 레퍼런스는 참고일 뿐, 더 고도화해야       → 레퍼런스에 없는 층을 얹는다(아래)
//   ⑤ 차트만이 아니라 «이슈 뉴스»와 엮어 종목을 설명하고,
//      거기에 «우리 고급 자원»을 접목한 흐름     → 이 버전의 핵심
//
// ── 레퍼런스보다 «더 나아간» 지점 ───────────────────────────────────────────
//   레퍼런스: 실적 뉴스 → 차트 → ETF 상품
//   우리    : **뉴스(출처·시각) → 그 종목의 반응 → 파급된 다른 종목 →
//              그 순간 옵션시장이 어디에 묶여 있었나(우리만 있는 층) → 앱**
//   즉 «남들도 아는 뉴스»에서 출발해 «우리만 보여줄 수 있는 데이터»로 착지한다.
//   그게 이 앱의 상품 논리(기관이 남긴 흔적)와 정확히 같은 축이다.
//
// ── 리텐션 조사 반영 (V4에서 이어짐) ────────────────────────────────────────
//   커리오시티 루프(훅에서 답을 미룸) / 첫 2초 온스크린 텍스트 /
//   상시 자막(무음 85%) / **루프백**(마지막 = 첫 배경)
//
// 컴플라이언스: 관찰형만. 인과 단정 금지 — 뉴스와 가격은 «같은 시간대»로만 잇는다.
// ============================================================================

import {
  AbsoluteFill, Img, Sequence, interpolate, staticFile,
  useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont();
const FPS = 30;
export const BRIEFING5_DURATION = 42 * FPS;

const C = {
  ink: '#FFFFFF',
  head: '#FFAA2B',
  faint: 'rgba(214,224,240,0.62)',
  up: '#3DE38F',
  down: '#FF5C74',
  panel: 'rgba(8,13,22,0.72)',
  line: 'rgba(255,255,255,0.20)',
};

type Block =
  | { kind: 'news'; source: string; at: string; headline: string; body: string }
  | { kind: 'quote'; label: string; price: string; pct: string; up: boolean; series: number[] }
  | { kind: 'rows'; rows: Array<{ t: string; pct: string; up: boolean; note: string }> }
  | { kind: 'levels'; src: string; focus: { x: number; y: number; w: number }; items: Array<{ k: string; v: string; sub: string }> };

export interface Briefing5Props {
  dateBadge: string;         // ★ 훅의 날짜 — "언제 뉴스인지"
  hookLine: string;
  hookSub: string;
  hookBg: string;
  loopLine: string;
  scenes: Array<{ bg: string; pan: 'in' | 'out' | 'left' | 'right'; eyebrow: string; head: string; caption: string; block: Block }>;
  outro: { app: string; line: string; cta: string };
}

const S = (s: number) => Math.round(s * FPS);
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const useIn = (d = 0, dur = 14) => interpolate(useCurrentFrame(), [d, d + dur], [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

// ── 레이아웃 상수 — «중간을 비우지 않기» 위해 영역을 명시적으로 잡는다 ──────
const PAD = 52;
const TOP_Y = 80;          // 상단 타이포 시작
const BLOCK_TOP = 430;     // ★ 블록이 시작하는 지점 — 중앙부터 채운다
const CAP_BOTTOM = 128;    // 자막 하단
const CAP_H = 132;         // 자막이 차지하는 높이(2줄 기준)
const BLOCK_BOTTOM = CAP_BOTTOM + CAP_H + 18;   // 블록 하한 = 자막 위
const BLOCK_H = 1920 - BLOCK_TOP - BLOCK_BOTTOM;

function PhotoBg({ src, pan, dur }: { src: string; pan: string; dur: number }) {
  const t = interpolate(useCurrentFrame(), [0, dur], [0, 1], { extrapolateRight: 'clamp' });
  const z = pan === 'in' ? 1.05 + t * 0.10 : pan === 'out' ? 1.16 - t * 0.10 : 1.11;
  const x = pan === 'left' ? -t * 4 : pan === 'right' ? t * 4 : 0;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#05070C' }}>
      <Img src={staticFile(src)} style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${z}) translateX(${x}%)`,
        filter: 'saturate(0.82) contrast(1.06) brightness(1.0)',
      }} />
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, rgba(4,7,13,0.90) 0%, rgba(4,7,13,0.58) 22%, rgba(4,7,13,0.30) 40%, rgba(4,7,13,0.86) 100%)',
      }} />
    </AbsoluteFill>
  );
}

function Caption({ text }: { text: string }) {
  const p = useIn(12, 11);
  return (
    <div style={{ position: 'absolute', left: PAD, right: PAD, bottom: CAP_BOTTOM, opacity: p }}>
      <div style={{
        background: 'linear-gradient(180deg, rgba(26,37,60,0.95), rgba(13,20,36,0.92))',
        border: `1px solid ${C.line}`, borderRadius: 16, padding: '16px 22px',
      }}>
        <div style={{ fontFamily, fontSize: 36, lineHeight: 1.28, fontWeight: 800, color: C.ink, letterSpacing: '-0.015em' }}>
          {text}
        </div>
      </div>
    </div>
  );
}

function TopType({ n, eyebrow, head }: { n: number; eyebrow: string; head: string }) {
  const a = useIn(1, 9), b = useIn(4, 11);
  return (
    <div style={{ position: 'absolute', top: TOP_Y, left: PAD, right: PAD }}>
      <div style={{ opacity: a, display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ fontFamily, fontSize: 30, fontWeight: 900, color: C.head, letterSpacing: '0.05em' }}>
          {String(n).padStart(2, '0')}
        </span>
        <div style={{ width: 84, height: 3, background: C.head, borderRadius: 2 }} />
        <span style={{ fontFamily, fontSize: 23, fontWeight: 700, color: C.ink }}>{eyebrow}</span>
      </div>
      <div style={{
        marginTop: 13, opacity: b, transform: `translateY(${(1 - b) * 14}px)`,
        fontFamily, fontSize: 70, lineHeight: 1.12, fontWeight: 900, color: C.head,
        letterSpacing: '-0.035em', whiteSpace: 'pre-line', textShadow: '0 6px 30px rgba(0,0,0,0.7)',
      }}>{head}</div>
    </div>
  );
}

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{
    background: C.panel, border: `1px solid ${C.line}`, borderRadius: 22,
    padding: '24px 26px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16)', ...style,
  }}>{children}</div>
);

// ── ① 뉴스 카드 — 출처·시각을 «자료»로 보여준다 ────────────────────────────
function NewsCard({ source, at, headline, body }: any) {
  const p = useIn(4, 16);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 18}px)`, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{
            fontFamily, fontSize: 18, fontWeight: 900, color: '#0A0E16',
            background: C.down, borderRadius: 6, padding: '4px 10px', letterSpacing: '0.08em',
          }}>NEWS</span>
          <span style={{ fontFamily, fontSize: 20, fontWeight: 700, color: C.faint }}>{source} · {at}</span>
        </div>
        <div style={{ fontFamily, fontSize: 40, lineHeight: 1.24, fontWeight: 900, color: C.ink, letterSpacing: '-0.02em' }}>
          {headline}
        </div>
        <div style={{ marginTop: 14, fontFamily, fontSize: 27, lineHeight: 1.42, fontWeight: 600, color: 'rgba(222,232,246,0.86)' }}>
          {body}
        </div>
      </Card>
    </div>
  );
}

// ── ② 종목 반응 — 큰 가격 + 장중 차트를 «한 카드»에 ────────────────────────
function QuoteCard({ label, price, pct, up, series }: any) {
  const p = useIn(4, 16), d = useIn(12, 28);
  const col = up ? C.up : C.down;
  const W = 890, H = 300, B = 16;
  const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
  const pts = series.map((v: number, i: number) =>
    `${((i / (series.length - 1)) * W).toFixed(1)},${((H - B) - ((v - lo) / span) * (H - B - 22)).toFixed(1)}`).join(' ');
  return (
    <div style={{ opacity: p, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily, fontSize: 24, fontWeight: 800, color: C.faint, letterSpacing: '0.1em' }}>{label}</div>
            <div style={{ fontFamily, fontSize: 76, fontWeight: 900, color: C.ink, letterSpacing: '-0.04em', marginTop: 2 }}>{price}</div>
          </div>
          <div style={{ fontFamily, fontSize: 62, fontWeight: 900, color: col, letterSpacing: '-0.035em' }}>{pct}</div>
        </div>
        <div style={{ marginTop: 16, clipPath: `inset(0 ${(1 - d) * 100}% 0 0)` }}>
          <svg width={W} height={H} style={{ display: 'block' }}>
            <defs>
              <linearGradient id="qg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={col} stopOpacity="0.30" />
                <stop offset="100%" stopColor={col} stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={`0,${H - B} ${pts} ${W},${H - B}`} fill="url(#qg)" />
            <polyline points={pts} fill="none" stroke={col} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
      </Card>
    </div>
  );
}

// ── ③ 파급 — 다른 종목들이 어떻게 반응했나 («왜»를 만든다) ─────────────────
function RowsCard({ rows }: any) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
      {rows.map((r: any, i: number) => {
        const p = useIn(4 + i * 8, 14);
        return (
          <Card key={r.t} style={{ opacity: p, transform: `translateX(${(1 - p) * -16}px)`, padding: '22px 26px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontFamily, fontSize: 54, fontWeight: 900, color: C.ink, letterSpacing: '-0.025em' }}>{r.t}</span>
              <span style={{ fontFamily, fontSize: 54, fontWeight: 900, color: r.up ? C.up : C.down, letterSpacing: '-0.03em' }}>{r.pct}</span>
            </div>
            <div style={{ marginTop: 6, fontFamily, fontSize: 24, fontWeight: 700, color: C.faint }}>{r.note}</div>
          </Card>
        );
      })}
    </div>
  );
}

// ── ④ 우리 고급 자원 — 앱 화면 + 수치를 «나란히». 잘리지 않게 높이를 계산 ──
function LevelsCard({ src, focus, items }: any) {
  const p = useIn(4, 16);
  const sc = 1 / focus.w;
  const SHOT_H = Math.round(BLOCK_H * 0.46);
  return (
    <div style={{ opacity: p, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
      <div style={{
        width: '100%', height: SHOT_H, borderRadius: 20, overflow: 'hidden', position: 'relative',
        border: `1px solid ${C.line}`, boxShadow: '0 22px 60px rgba(0,0,0,0.6)',
      }}>
        <Img src={staticFile(src)} style={{
          position: 'absolute', width: `${sc * 100}%`,
          left: `${-focus.x * sc * 100}%`, top: `${-focus.y * sc * 100}%`,
          filter: 'brightness(1.28) contrast(1.10)',
        }} />
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {items.map((it: any, i: number) => {
          const q = useIn(14 + i * 6, 12);
          return (
            <Card key={it.k} style={{ flex: 1, padding: '18px 18px', opacity: q }}>
              <div style={{ fontFamily, fontSize: 18, fontWeight: 800, color: C.faint, letterSpacing: '0.08em' }}>{it.k}</div>
              <div style={{ fontFamily, fontSize: 40, fontWeight: 900, color: C.head, letterSpacing: '-0.03em', marginTop: 2 }}>{it.v}</div>
              <div style={{ fontFamily, fontSize: 19, fontWeight: 700, color: 'rgba(222,232,246,0.8)', marginTop: 2 }}>{it.sub}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export const BriefingV5: React.FC<Briefing5Props> = (p) => {
  const HOOK = S(3.5), OUTRO = S(4.5), LOOP = S(3);
  const body = BRIEFING5_DURATION - HOOK - OUTRO - LOOP;
  const per = Math.floor(body / p.scenes.length);
  const outroFrom = HOOK + p.scenes.length * per;
  const loopFrom = BRIEFING5_DURATION - LOOP;

  return (
    <AbsoluteFill style={{ background: '#05070C' }}>
      {/* 00 훅 — 날짜 배지 + 질문 */}
      <Sequence durationInFrames={HOOK}>
        <PhotoBg src={p.hookBg} pan="in" dur={HOOK} />
        <AbsoluteFill style={{ justifyContent: 'center', padding: `0 ${PAD}px 110px` }}>
          <Hook date={p.dateBadge} line={p.hookLine} sub={p.hookSub} />
        </AbsoluteFill>
      </Sequence>

      {p.scenes.map((sc, i) => (
        <Sequence key={i} from={HOOK + i * per} durationInFrames={per}>
          <PhotoBg src={sc.bg} pan={sc.pan} dur={per} />
          <TopType n={i + 1} eyebrow={sc.eyebrow} head={sc.head} />
          {/* ★ 블록이 «중앙부터 자막 위까지»를 꽉 채운다 — 빈 공간 제거 */}
          <div style={{ position: 'absolute', left: PAD, right: PAD, top: BLOCK_TOP, height: BLOCK_H }}>
            {sc.block.kind === 'news' && <NewsCard {...sc.block} />}
            {sc.block.kind === 'quote' && <QuoteCard {...sc.block} />}
            {sc.block.kind === 'rows' && <RowsCard {...sc.block} />}
            {sc.block.kind === 'levels' && <LevelsCard {...sc.block} />}
          </div>
          <Caption text={sc.caption} />
        </Sequence>
      ))}

      <Sequence from={outroFrom} durationInFrames={loopFrom - outroFrom}>
        <PhotoBg src="shorts/broll/v25_scene7_outro.png" pan="in" dur={loopFrom - outroFrom} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 64px' }}>
          <Rise>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily, fontSize: 76, fontWeight: 900, color: C.head, letterSpacing: '-0.035em', textShadow: '0 6px 30px rgba(0,0,0,0.6)' }}>{p.outro.app}</div>
              <div style={{ fontFamily, marginTop: 12, fontSize: 27, fontWeight: 700, color: C.ink }}>{p.outro.line}</div>
              <div style={{ marginTop: 24, display: 'inline-block', fontFamily, fontSize: 25, fontWeight: 900, color: '#0A0E16', background: C.head, borderRadius: 999, padding: '13px 38px' }}>{p.outro.cta}</div>
            </div>
          </Rise>
        </AbsoluteFill>
      </Sequence>

      <Sequence from={loopFrom} durationInFrames={LOOP}>
        <PhotoBg src={p.hookBg} pan="in" dur={LOOP} />
        <AbsoluteFill style={{ justifyContent: 'center', padding: `0 ${PAD}px 110px` }}>
          <Rise>
            <div style={{ fontFamily, fontSize: 80, lineHeight: 1.16, fontWeight: 900, color: C.ink, letterSpacing: '-0.035em', whiteSpace: 'pre-line', textShadow: '0 6px 30px rgba(0,0,0,0.72)' }}>{p.loopLine}</div>
          </Rise>
        </AbsoluteFill>
      </Sequence>

      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none' }}>
        <div style={{ fontFamily, marginBottom: 44, fontSize: 19, fontWeight: 700, color: 'rgba(214,224,240,0.72)' }}>
          Informational only. Not investment advice.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 훅 — ★날짜 배지가 먼저. "언제 뉴스인지"를 0초에 못박는다 */
function Hook({ date, line, sub }: { date: string; line: string; sub: string }) {
  const a = useIn(0, 7), b = useIn(3, 10);
  return (
    <div>
      <div style={{
        display: 'inline-block', opacity: a, marginBottom: 20,
        fontFamily, fontSize: 26, fontWeight: 900, color: '#0A0E16',
        background: C.head, borderRadius: 8, padding: '9px 18px', letterSpacing: '0.06em',
      }}>{date}</div>
      <div style={{
        opacity: b, transform: `translateY(${(1 - b) * 14}px)`,
        fontFamily, fontSize: 86, lineHeight: 1.13, fontWeight: 900, color: C.ink,
        letterSpacing: '-0.038em', whiteSpace: 'pre-line', textShadow: '0 6px 30px rgba(0,0,0,0.74)',
      }}>{line}</div>
      <div style={{ marginTop: 16, opacity: b, fontFamily, fontSize: 40, fontWeight: 900, color: C.head, letterSpacing: '-0.02em' }}>{sub}</div>
    </div>
  );
}

function Rise({ children }: { children: React.ReactNode }) {
  const p = useIn(2, 15);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 18}px)` }}>{children}</div>;
}
