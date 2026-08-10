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
  AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile,
  useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { AppShot, type ShotFocus, type ShotCallout } from '../components/AppShot';
import { Backdrop, type BackdropSpec, type BackdropData } from './Backdrop';
import { CANVAS, SAFE, CAPTION, PACE, C, BACKDROP_FOR, HOOK_BACKDROP, type BeatRole } from './spec';
import { TickerMark, SymbolHero } from '../components/TickerMark';
import { SYM, resolveSymbol } from './symbols';

const { fontFamily } = loadFont();
const F = (s: number) => Math.round(s * CANVAS.fps);
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const useIn = (d = 0, dur = 10) => interpolate(useCurrentFrame(), [d, d + dur], [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

// ── 비트 = 영상의 최소 단위 ────────────────────────────────────────────────
export type Visual =
  /** sym: 심볼로 그릴 라벨. 생략하면 label/k 에서 자동 해석 (§4 — 숫자 옆엔 늘 심볼) */
  | { kind: 'stat'; label: string; value: string; sub: string; up: boolean; sym?: string }
  | { kind: 'versus'; aK: string; aV: string; bK: string; bV: string; aSym?: string; bSym?: string }
  | { kind: 'rows'; rows: Array<{ k: string; v: string; up: boolean; note?: string; sym?: string }> }
  | { kind: 'logos'; items: Array<{ t: string; pct: string; up: boolean }> }
  | { kind: 'source'; outlet: string; at: string; headline: string; body?: string }
  /** ★ 리서치 인용 슬롯 (대본 4단의 «권위» 단계) — 앱 내 애널리스트 컨센서스.
      제3자 의견의 «집계»를 사실로 보여준다. 우리 의견으로 섞지 않는다. */
  | { kind: 'consensus'; rating: string; pct: string; n: string; up: boolean; note?: string }
  | { kind: 'shot'; src: string; focus: ShotFocus; callout?: ShotCallout }
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
  /** 배경 덮어쓰기 — 문자열이면 이미지 경로, 아니면 절차 배경 명세 */
  bg?: string | BackdropSpec;
}

export interface BriefingProps {
  /** 고정 배너 훅 제목 — 중간 유입자도 3초 안에 뭘 보는지 알게 */
  title: string;
  date: string;
  /** hook.syms = 프레임0 지배 요소. 1개면 단독, 2~3개면 클러스터 (§1-3) */
  hook: { line: string; sub: string; role?: BeatRole; bg?: string | BackdropSpec; syms?: string[]; stamp?: string };
  beats: Beat[];
  outro: { app: string; line: string; ask: string };
  /** 마지막이 첫 화면으로 이어지는 루프백 문장 */
  loop: string;
  /** 절차 배경이 쓸 실데이터 (seed=티커, series=당일 시계열 등) */
  data?: BackdropData;
  /** 하단 티커 테이프 — 캡처 .txt 와 같은 순간의 시장 값들 (플랫폼 UI에 덮여도 되는 존) */
  tape?: Array<{ t: string; v: string; up?: boolean }>;
  /** ★ ElevenLabs 음성 트랙 (scripts/tts-beats.mjs 가 생성).
      낭독 «실측» 길이가 컷 길이의 정답이 된다 — 글자수 추정(msFor)을 대체. */
  voice?: VoiceTrack;
}

export interface VoiceSeg { f: string; sec: number }
export interface VoiceTrack {
  base: string;                      // staticFile 기준 폴더 (예: 'shorts/audio/close')
  hook?: VoiceSeg;
  beats: Array<VoiceSeg | null>;     // beats[i] 와 1:1
  outro?: VoiceSeg;
  loop?: VoiceSeg;
}

/** beat.bg → BackdropSpec 정규화 (문자열 = 구판 이미지 경로) */
const bgOf = (b: Beat): BackdropSpec =>
  typeof b.bg === 'string' ? { kind: 'img', src: b.bg } : (b.bg ?? BACKDROP_FOR[b.role]);

const baseSecFor = (b: Beat) =>
  b.sec ?? (b.visual?.kind === 'shot' || b.visual?.kind === 'source' ? PACE.proofSec : PACE.beatSec);

/** 음성이 있으면 «낭독 실측 + 0.5s 숨»이 하한이 된다 */
const secFor = (b: Beat, seg?: VoiceSeg | null) =>
  seg ? Math.max(baseSecFor(b), seg.sec + 0.35) : baseSecFor(b);   // 낭독 + 짧은 숨

/** 훅/CTA/루프 길이 — 음성이 스펙 기본값보다 길면 음성을 따른다 */
export function timingOf(p: BriefingProps) {
  const v = p.voice;
  const hookSec = v?.hook ? Math.max(PACE.hookSec, v.hook.sec + 0.25) : PACE.hookSec;
  const beatSecs = p.beats.map((b, i) => secFor(b, v?.beats?.[i]));
  const ctaSec = v?.outro ? Math.max(PACE.ctaSec, v.outro.sec + 0.3) : PACE.ctaSec;
  const loopSec = v?.loop ? Math.max(PACE.loopSec, v.loop.sec + 0.2) : PACE.loopSec;
  return { hookSec, beatSecs, ctaSec, loopSec };
}

const Say2 = ({ v, seg }: { v?: VoiceTrack; seg?: VoiceSeg | null }) =>
  v && seg ? <Audio src={staticFile(`${v.base}/${seg.f}`)} /> : null;

// (배경은 kit/Backdrop 이 전담한다 — 이미지·영상·절차 모드 공용)

// ── 컷 플래시 (2026-08-07) ─────────────────────────────────────────────────
// 실측: 절차 배경끼리는 같은 다크 팔레트라 밝기 차가 작아 컷이 «병합»돼 읽혔다
// (12초짜리 샷으로 잡힘). V2~V3 교훈 — 검출기에 안 잡히면 사람 눈에도 한 컷이다.
// 비트 시작 5프레임에 옅은 플래시를 넣어 경계를 눈(과 검출기)에 새긴다.
function CutFlash() {
  const o = interpolate(useCurrentFrame(), [0, 6], [0.2, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: '#EAF2FF', opacity: o, pointerEvents: 'none' }} />;
}

// ── 고정 배너 (실로고 + 제목 + 날짜) ────────────────────────────────────────
// [2026-08-07 대표 피드백] 실제 SIGNUM 로고를 쓴다 (public/app-icons/signum.png)
const LOGO = 'app-icons/signum.png';

function Banner({ title, date }: { title: string; date: string }) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40 }}>
      <div style={{
        background: 'linear-gradient(180deg, rgba(11,18,32,0.97), rgba(8,13,24,0.92))',
        borderBottom: `2px solid ${C.head}`, padding: '26px 40px 18px',
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <Img src={staticFile(LOGO)} style={{ width: 88, height: 88, borderRadius: 22, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily, fontSize: 44, lineHeight: 1.14, fontWeight: 900, color: C.head, letterSpacing: '-0.03em', whiteSpace: 'pre-line' }}>
            {title}
          </div>
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily, fontSize: 21, fontWeight: 800, color: C.ink }}>SIGNUM HQ</span>
            <span style={{ fontFamily, fontSize: 21, fontWeight: 800, color: C.faint }}>{date}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 하단 존 (2026-08-07 대표 피드백: «아래쪽이 텅 비어 있다») ────────────────
// SAFE.bottom(1440) 아래 25%는 플랫폼 UI가 덮는 자리라 «중요 정보»는 못 놓는다.
// 대신 덮여도 되는 것: 브랜드 워터마크 + 티커 테이프. 빈 화면이 아니라
// 라이브 터미널처럼 보이게 하는 앰비언트 존이다. 테이프 값도 캡처 실측.
function BottomZone({ tape }: { tape?: Array<{ t: string; v: string; up?: boolean }> }) {
  const f = useCurrentFrame();
  const items = tape ?? [];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: SAFE.bottom, bottom: 0, zIndex: 30, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 104, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, opacity: 0.62 }}>
        <Img src={staticFile(LOGO)} style={{ width: 48, height: 48, borderRadius: 12 }} />
        <span style={{ fontFamily, fontSize: 26, fontWeight: 900, letterSpacing: '0.16em', color: 'rgba(224,232,246,0.92)' }}>SIGNUM HQ</span>
      </div>
      {items.length > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 92, overflow: 'hidden',
          borderTop: '1px solid rgba(255,255,255,0.10)', borderBottom: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(6,10,18,0.55)',
        }}>
          <div style={{ display: 'flex', whiteSpace: 'nowrap', transform: `translateX(${-(f * 2.2)}px)`   /* mod 래핑은 내용폭≠주기라 이음매가 튄다 — 60s(3960px)도 4반복(~8000px)이 덮는다 */, padding: '13px 0' }}>
            {[0, 1, 2, 3].map((rep) => items.map((it, i) => (
              <span key={`${rep}-${i}`} style={{ fontFamily, fontSize: 24, fontWeight: 800, padding: '0 28px', display: 'inline-flex', gap: 10 }}>
                <span style={{ color: C.ink }}>{it.t}</span>
                <span style={{ color: it.up == null ? C.faint : it.up ? C.cool : C.hot }}>{it.v}</span>
              </span>
            )))}
          </div>
        </div>
      )}
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
    <div style={{ position: 'absolute', top: SAFE.top - 174, left: 44, right: 44 }}>
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
    <div style={box}><Card style={{ padding: '26px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <TickerMark t={v.sym ?? v.label} size={SYM.stat} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily, fontSize: 23, fontWeight: 800, color: C.faint, letterSpacing: '0.1em' }}>{v.label}</div>
          <div style={{ fontFamily, fontSize: 92, fontWeight: 900, color: v.up ? C.cool : C.hot, letterSpacing: '-0.045em', lineHeight: 1.04 }}>{v.value}</div>
        </div>
      </div>
      <div style={{ fontFamily, fontSize: 25, fontWeight: 700, color: C.ink, marginTop: 6 }}>{v.sub}</div>
    </Card></div>
  );

  if (v.kind === 'versus') {
    const B = ({ k, val, col, d, sym }: any) => {
      const q = useIn(d, 12);
      return (
        <Card style={{ flex: 1, opacity: q, padding: '22px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <TickerMark t={sym ?? k} size={SYM.chip} />
            <div style={{ fontFamily, fontSize: 20, fontWeight: 800, color: C.faint, letterSpacing: '0.08em' }}>{k}</div>
          </div>
          <div style={{ fontFamily, fontSize: 58, fontWeight: 900, color: col, letterSpacing: '-0.04em', lineHeight: 1.1 }}>{val}</div>
        </Card>
      );
    };
    return <div style={{ ...box, flexDirection: 'row', alignItems: 'center' }}>
      <B k={v.aK} val={v.aV} col={C.cool} d={3} sym={v.aSym} /><B k={v.bK} val={v.bV} col={C.hot} d={11} sym={v.bSym} />
    </div>;
  }

  if (v.kind === 'rows') return (
    <div style={box}>{v.rows.map((r, i) => {
      const q = useIn(3 + i * 7, 12);
      return (
        <Card key={r.k} style={{ opacity: q, transform: `translateX(${(1 - q) * -14}px)`, padding: '20px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <TickerMark t={r.sym ?? r.k} size={SYM.chip} />
            <span style={{ fontFamily, fontSize: 44, fontWeight: 900, color: C.ink, letterSpacing: '-0.025em' }}>{r.k}</span>
            <span style={{ marginLeft: 'auto', fontFamily, fontSize: 50, fontWeight: 900, color: r.up ? C.cool : C.hot, letterSpacing: '-0.03em' }}>{r.v}</span>
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
            <TickerMark t={it.t} size={SYM.card} />
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

  // ★ 리서치 인용 — 대본 4단 «뉴스→설명→인용→우리 해석»의 3번째 슬롯.
  //   제3자 의견의 집계(사실)로 표시한다. 우리 판단으로 섞지 않는다.
  if (v.kind === 'consensus') {
    const bar = useIn(8, 20);
    const pctNum = parseFloat(v.pct) || 0;
    return (
      <div style={box}><Card style={{ padding: '26px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontFamily, fontSize: 17, fontWeight: 900, color: '#0A0E16', background: C.head, borderRadius: 6, padding: '4px 10px', letterSpacing: '0.08em' }}>CONSENSUS</span>
          <span style={{ fontFamily, fontSize: 19, fontWeight: 700, color: C.faint }}>{v.n} analysts · aggregated</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
          <span style={{ fontFamily, fontSize: 92, fontWeight: 900, color: v.up ? C.cool : C.hot, letterSpacing: '-0.045em', lineHeight: 1.02 }}>{v.rating}</span>
          <span style={{ fontFamily, fontSize: 60, fontWeight: 900, color: C.ink, letterSpacing: '-0.03em' }}>{v.pct}</span>
        </div>
        <div style={{ marginTop: 16, height: 16, borderRadius: 8, background: 'rgba(255,255,255,0.10)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, pctNum) * bar}%`, height: '100%', borderRadius: 8, background: `linear-gradient(90deg, ${v.up ? C.cool : C.hot}, ${C.head})` }} />
        </div>
        {v.note && <div style={{ marginTop: 12, fontFamily, fontSize: 23, fontWeight: 700, color: C.faint }}>{v.note}</div>}
      </Card></div>
    );
  }

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

  // shot — 콜아웃(라벨 있는 강조)만 허용. 라벨 없는 빨간 박스는 타입에서 막았다.
  // [2026-08-07 조사반영] 4.5초 증거 컷은 권고(≤3초) 초과 → 2초 시점 «내부 펀치인»
  // (100→106%, 0.4초)으로 씬을 둘로 나눈다. 콜아웃도 같은 순간에 켜져 시선을 다시 잡는다.
  const r = useIn(58, 12);
  const punch = interpolate(useCurrentFrame(), [58, 70], [1, 1.06],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return (
    <div style={{ opacity: p, height: '100%', display: 'flex', alignItems: 'center', transform: `scale(${punch})`, transformOrigin: '50% 42%' }}>
      <AppShot src={v.src} focus={v.focus} callout={v.callout} calloutOpacity={r} width={w} height={h} />
    </div>
  );
}

// ── 본체 ────────────────────────────────────────────────────────────────────
export const Briefing: React.FC<BriefingProps> = (p) => {
  const { durationInFrames } = useVideoConfig();
  const PAD = 44;
  const VIS_TOP = SAFE.top + 40;   // [2026-08-07] 배너-헤드 «딱 붙음» 해소로 헤드가 내려온 만큼
  // 자막 실측 높이: 본문 2줄(74*1.22*2=180) + 패딩 40 + 질문(2줄 52*1.2=125 + 패딩 32 + 여백 12)
  const CAP_BLOCK_H = 180 + 40 + 125 + 32 + 12;   // 389
  const CAP_TOP = SAFE.bottom - 24 - CAP_BLOCK_H;
  const VIS_H = Math.max(320, CAP_TOP - VIS_TOP - 20);
  const VIS_W = CANVAS.w - PAD * 2;

  const T = timingOf(p);
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

  // 훅은 유일하게 «움직이는 실사»(kling 5.04s 영상) — role 지정 시 그 역할의 절차 배경
  const hookBg: BackdropSpec = p.hook.bg
    ? (typeof p.hook.bg === 'string' ? { kind: 'img', src: p.hook.bg } : p.hook.bg)
    : p.hook.role ? BACKDROP_FOR[p.hook.role] : HOOK_BACKDROP;
  const data = p.data ?? {};

  return (
    <AbsoluteFill style={{ background: '#05070C' }}>
      {/* 훅 */}
      <Sequence durationInFrames={hookF}>
        <Backdrop spec={hookBg} dur={hookF} data={data} />
        <Say2 v={p.voice} seg={p.voice?.hook} />
        <AbsoluteFill style={{ justifyContent: 'center', padding: `0 ${PAD}px`, paddingTop: 120 }}>
          <HookBlock line={p.hook.line} sub={p.hook.sub} date={p.hook.stamp ?? p.date} syms={p.hook.syms} />
        </AbsoluteFill>
      </Sequence>

      {/* 비트 — 톤을 교대로 줘서 인접 컷의 밝기 차를 만든다 (컷이 «읽히게») */}
      {spans.map(({ b, from, len }, i) => (
        <Sequence key={i} from={from} durationInFrames={len}>
          <Backdrop spec={bgOf(b)} dur={len} data={data} tone={i % 2 === 0 ? 1 : 1.6} />
          <CutFlash />
          <Say2 v={p.voice} seg={p.voice?.beats?.[i]} />
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
        <Backdrop spec={BACKDROP_FOR.brand} dur={ctaLen} data={data} />
        <Say2 v={p.voice} seg={p.voice?.outro} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 60px' }}>
          <CtaBlock {...p.outro} />
        </AbsoluteFill>
      </Sequence>

      {/* 루프백 — 첫 화면으로 이어진다 */}
      <Sequence from={loopFrom} durationInFrames={loopF}>
        <Backdrop spec={hookBg} dur={loopF} data={data} />
        <Say2 v={p.voice} seg={p.voice?.loop} />
        <AbsoluteFill style={{ justifyContent: 'center', padding: `0 ${PAD}px`, paddingTop: 120 }}>
          <Rise><div style={{
            fontFamily, fontSize: 78, lineHeight: 1.16, fontWeight: 900, color: C.ink,
            letterSpacing: '-0.035em', whiteSpace: 'pre-line', textShadow: '0 6px 30px rgba(0,0,0,0.74)',
          }}>{p.loop}</div></Rise>
        </AbsoluteFill>
      </Sequence>

      {/* [§1-2] 훅 구간에는 배너·테이프를 그리지 않는다 — 프레임0에서 «1초에 읽히는
          블록»은 심볼+훅 두 개뿐이어야 한다. 본문부터 등장한다. */}
      <Sequence from={hookF}>
        <BottomZone tape={p.tape} />
        <Banner title={p.title} date={p.date} />
      </Sequence>

      {/* 면책은 프레임0부터 상시 — 가독성 하한(26px / opacity .85) */}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none' }}>
        <div style={{ fontFamily, marginBottom: 26, fontSize: 26, fontWeight: 700, color: 'rgba(224,234,248,0.85)' }}>
          Informational only. Not investment advice.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

function HookBlock({ line, sub, date, syms }: { line: string; sub: string; date: string; syms?: string[] }) {
  // [2026-08-07 조사반영] Shorts 는 커스텀 썸네일이 없다 — «프레임 0 이 썸네일»이다.
  // 훅 문장은 페이드 없이 프레임 0 부터 완전히 보인다. 배지·서브만 미세하게 뜬다.
  // [2026-08-10 §1-3] 심볼 히어로 — 문장보다 먼저 읽히는 «무엇인지»의 답.
  //   프레임 0 부터 불투명 (로고 페이드인 금지).
  const a = useIn(0, 5);
  const b = 1;
  return (
    <div>
      {syms && syms.length > 0 && (
        <div style={{ marginBottom: 26, display: 'flex', justifyContent: 'flex-start' }}>
          <SymbolHero syms={syms} size={SYM.hero} />
        </div>
      )}
      <div style={{
        display: 'inline-block', opacity: a, marginBottom: 18,
        fontFamily, fontSize: 24, fontWeight: 900, color: '#0A0E16',
        background: C.head, borderRadius: 8, padding: '8px 16px', letterSpacing: '0.06em',
      }}>{date}</div>
      <div style={{
        opacity: b, transform: `translateY(${(1 - b) * 12}px)`,
        fontFamily, fontSize: syms && syms.length ? 72 : 84, lineHeight: 1.12, fontWeight: 900, color: C.ink,
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
        <Img src={staticFile(LOGO)} style={{ width: 124, height: 124, borderRadius: 30, margin: '0 auto 18px', display: 'block', boxShadow: '0 14px 40px rgba(0,0,0,0.5)' }} />
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

/** 대본 길이에서 총 프레임을 계산 — 컴포지션 등록 시 사용 (음성 길이 반영) */
export function durationOf(p: BriefingProps) {
  const T = timingOf(p);
  const body = T.beatSecs.reduce((a, s2) => a + F(s2), 0);
  return F(T.hookSec) + body + F(T.ctaSec) + F(T.loopSec);
}
