// ============================================================================
// BriefingV6 — 「경제사냥꾼」 장치 차용판
// ----------------------------------------------------------------------------
// 정본 분석: .agent/SHORTS_REF_ANALYSIS_2026-08-04.md
// 경제사냥꾼(구독 60만·쇼츠 전용) 2편 실측에서 차용한 것:
//
//   🟢 차용
//     ① **제목 배너 «영상 내내 고정»** — 중간 유입자도 3초 안에 뭘 보는지 안다
//     ② **날짜 고정** — 대표 지적("언제 뉴스인지")과 정확히 일치
//     ③ **자막 밀도 3초/문장** (저쪽 2.9~3.3초. 우리 V5는 7초 = 2배 느렸다)
//     ④ **핵심어만 색 강조** — 눈이 그 단어에 꽂힌다
//     ⑤ **자료에 빨간 표시** — 저쪽은 공시 원문에 빨간 밑줄. 우리는 «앱 화면에 빨간 네모»
//     ⑥ **질문형 CTA** — 앱 설치만 걸면 광고, 질문을 던지면 콘텐츠
//     ⑦ **역순/모순 훅** — buried lede 회피(흥미로운 걸 15초에 두면 70%가 떠남)
//
//   🔴 안 차용
//     · 마스코트 캐릭터 — 기관급 포지셔닝과 충돌.
//       대신 **1인칭 화법 자막**("I pulled the flow data")으로 «화자» 효과만 가져온다
//     · 크림색 배경 — 브랜드가 다크. 대신 밝기를 올려 대비를 확보
//
// 컴플라이언스: 관찰형만. 예측·매수매도·방향 암시 0.
// ============================================================================

import {
  AbsoluteFill, Img, Sequence, interpolate, staticFile,
  useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont();
const FPS = 30;
export const BRIEFING6_DURATION = 60 * FPS;   // 60s — 42초는 «흐름»이 안 생겼다

const C = {
  ink: '#FFFFFF',
  head: '#FFB020',
  hot: '#FF5C74',
  cool: '#3DE38F',
  faint: 'rgba(214,224,240,0.62)',
  panel: 'rgba(9,14,24,0.78)',
  line: 'rgba(255,255,255,0.22)',
};

// ── 자막: 핵심어만 색을 입힌다 (경제사냥꾼 ④) ──────────────────────────────
// 마크업: **빨강** / __초록__ / ==앰버==
function RichText({ text, size, weight = 900 }: { text: string; size: number; weight?: number }) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|==[^=]+==)/g).filter(Boolean);
  return (
    <span style={{ fontFamily, fontSize: size, fontWeight: weight, lineHeight: 1.26, letterSpacing: '-0.018em' }}>
      {parts.map((s, i) => {
        if (s.startsWith('**')) return <span key={i} style={{ color: C.hot }}>{s.slice(2, -2)}</span>;
        if (s.startsWith('__')) return <span key={i} style={{ color: C.cool }}>{s.slice(2, -2)}</span>;
        if (s.startsWith('==')) return <span key={i} style={{ color: C.head }}>{s.slice(2, -2)}</span>;
        return <span key={i} style={{ color: C.ink }}>{s}</span>;
      })}
    </span>
  );
}

export interface Briefing6Props {
  title: string;          // ★ 고정 배너 제목
  date: string;           // ★ 고정 날짜
  channel: string;
  hookBg: string;
  /** 자막 트랙 — 3초마다 한 문장 (경제사냥꾼 ③) */
  lines: Array<{
    at: number;           // 초
    text: string;         // 마크업 지원
    bg?: string;          // 배경 교체 (없으면 유지)
    visual?:
      | { kind: 'big'; label: string; value: string; sub: string; up: boolean }
      | { kind: 'split'; aK: string; aV: string; bK: string; bV: string }
      | { kind: 'shot'; src: string; focus: { x: number; y: number; w: number }; box?: { x: number; y: number; w: number; h: number }; tag: string };
  }>;
  cta: string;            // 질문형
  outro: { app: string; line: string };
}

const S = (s: number) => Math.round(s * FPS);
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const useIn = (d = 0, dur = 10) => interpolate(useCurrentFrame(), [d, d + dur], [0, 1],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

// ── ① 고정 제목 배너 + ② 날짜 ──────────────────────────────────────────────
function Banner({ title, date, channel }: { title: string; date: string; channel: string }) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50 }}>
      <div style={{
        background: 'linear-gradient(180deg, #10182A 0%, #0B1220 100%)',
        borderBottom: `2px solid ${C.head}`, padding: '26px 40px 18px',
      }}>
        <div style={{ fontFamily, fontSize: 46, lineHeight: 1.16, fontWeight: 900, color: C.head, letterSpacing: '-0.03em' }}>
          {title}
        </div>
      </div>
      <div style={{
        background: 'rgba(8,12,20,0.92)', padding: '10px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${C.line}`,
      }}>
        <span style={{ fontFamily, fontSize: 22, fontWeight: 800, color: C.ink }}>{channel}</span>
        <span style={{ fontFamily, fontSize: 22, fontWeight: 800, color: C.faint }}>{date}</span>
      </div>
    </div>
  );
}

function Bg({ src, dur }: { src: string; dur: number }) {
  const t = interpolate(useCurrentFrame(), [0, dur], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#05070C' }}>
      <Img src={staticFile(src)} style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${1.06 + t * 0.08})`,
        filter: 'saturate(0.8) contrast(1.05) brightness(1.04)',
      }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(4,7,13,0.72) 0%, rgba(4,7,13,0.30) 34%, rgba(4,7,13,0.84) 100%)' }} />
    </AbsoluteFill>
  );
}

// ── 시각 요소들 ─────────────────────────────────────────────────────────────
function BigStat({ label, value, sub, up }: any) {
  const p = useIn(0, 12);
  return (
    <div style={{
      opacity: p, transform: `translateY(${(1 - p) * 18}px)`,
      background: C.panel, border: `1px solid ${C.line}`, borderRadius: 24, padding: '30px 34px',
    }}>
      <div style={{ fontFamily, fontSize: 25, fontWeight: 800, color: C.faint, letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontFamily, fontSize: 104, fontWeight: 900, color: up ? C.cool : C.hot, letterSpacing: '-0.045em', lineHeight: 1.05 }}>{value}</div>
      <div style={{ fontFamily, fontSize: 27, fontWeight: 700, color: C.ink, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Split({ aK, aV, bK, bV }: any) {
  const a = useIn(0, 12), b = useIn(8, 12);
  const Box = ({ k, v, col, p }: any) => (
    <div style={{
      flex: 1, opacity: p, transform: `translateY(${(1 - p) * 16}px)`,
      background: C.panel, border: `1px solid ${col}66`, borderRadius: 22, padding: '26px 24px',
    }}>
      <div style={{ fontFamily, fontSize: 21, fontWeight: 800, color: C.faint, letterSpacing: '0.08em' }}>{k}</div>
      <div style={{ fontFamily, fontSize: 62, fontWeight: 900, color: col, letterSpacing: '-0.04em', lineHeight: 1.1, marginTop: 4 }}>{v}</div>
    </div>
  );
  return <div style={{ display: 'flex', gap: 14 }}><Box k={aK} v={aV} col={C.cool} p={a} /><Box k={bK} v={bV} col={C.hot} p={b} /></div>;
}

// ── ⑤ 앱 화면 + «빨간 네모»로 여기를 보라 ──────────────────────────────────
// [BUG FIX 2026-08-04] `top: ${-focus.y * sc * 100}%` 로 잡았더니 크롭이 원하는 만큼
// 안 내려가 «타일이 아니라 상단 티커 칩»이 보였고 빨간 네모도 엉뚱한 곳을 가리켰다.
// 원인: CSS 에서 top 의 % 는 «컨테이너 높이» 기준이지 «이미지 높이» 기준이 아니다.
// → 이미지 실제 크기를 픽셀로 계산해서 배치한다. 앱 캡처는 전부 1206×2622(@3x).
const SHOT_ASPECT = 2622 / 1206;
const SHOT_W = 1080 - 44 * 2;          // 좌우 패딩 제외한 실제 폭

function Shot({ src, focus, box, tag }: any) {
  const p = useIn(0, 12), r = useIn(10, 10);
  const imgW = SHOT_W / focus.w;                 // 가로 focus.w 비율만 보이도록 확대
  const imgH = imgW * SHOT_ASPECT;
  const left = -focus.x * imgW;
  const top = -focus.y * imgH;
  const H = 560;
  return (
    <div style={{ opacity: p }}>
      <div style={{
        width: SHOT_W, height: H, borderRadius: 22, overflow: 'hidden', position: 'relative',
        border: `1px solid ${C.line}`, boxShadow: '0 22px 60px rgba(0,0,0,0.6)',
      }}>
        <Img src={staticFile(src)} style={{
          position: 'absolute', width: imgW, height: imgH, left, top,
          maxWidth: 'none', filter: 'brightness(1.26) contrast(1.08)',
        }} />
        {/* 빨간 네모 — 좌표는 «이미지 기준 비율». 저쪽이 공시 원문에 밑줄 긋는 것과 같은 역할 */}
        {box && (
          <div style={{
            position: 'absolute',
            left: left + box.x * imgW, top: top + box.y * imgH,
            width: box.w * imgW, height: box.h * imgH,
            border: `5px solid ${C.hot}`, borderRadius: 12,
            boxShadow: `0 0 26px ${C.hot}88`, opacity: r,
          }} />
        )}
      </div>
      <div style={{ marginTop: 12, textAlign: 'center', fontFamily, fontSize: 25, fontWeight: 900, color: C.hot, letterSpacing: '0.04em', opacity: r }}>
        {tag}
      </div>
    </div>
  );
}

export const BriefingV6: React.FC<Briefing6Props> = (p) => {
  const { durationInFrames } = useVideoConfig();
  const BANNER_H = 210;
  const CAP_BOTTOM = 120;
  const CAP_H = 150;
  const VIS_TOP = BANNER_H + 40;
  const VIS_H = 1920 - VIS_TOP - (CAP_BOTTOM + CAP_H + 24);

  // 배경 트랙 — bg 가 지정된 줄에서만 교체
  let cur = p.hookBg;
  const bgSpans: Array<{ src: string; from: number; to: number }> = [];
  p.lines.forEach((l, i) => {
    if (l.bg) cur = l.bg;
    const from = S(l.at);
    const to = i + 1 < p.lines.length ? S(p.lines[i + 1].at) : durationInFrames - S(6);
    const last = bgSpans[bgSpans.length - 1];
    if (last && last.src === cur) last.to = to;
    else bgSpans.push({ src: cur, from, to });
  });

  return (
    <AbsoluteFill style={{ background: '#05070C' }}>
      {bgSpans.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.to - s.from}>
          <Bg src={s.src} dur={s.to - s.from} />
        </Sequence>
      ))}

      {/* 시각 요소 + 자막 — 3초마다 교체 */}
      {p.lines.map((l, i) => {
        const from = S(l.at);
        const to = i + 1 < p.lines.length ? S(p.lines[i + 1].at) : durationInFrames - S(6);
        return (
          <Sequence key={i} from={from} durationInFrames={to - from}>
            {l.visual && (
              <div style={{ position: 'absolute', left: 44, right: 44, top: VIS_TOP, height: VIS_H, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {l.visual.kind === 'big' && <BigStat {...l.visual} />}
                {l.visual.kind === 'split' && <Split {...l.visual} />}
                {l.visual.kind === 'shot' && <Shot {...l.visual} />}
              </div>
            )}
            <div style={{ position: 'absolute', left: 44, right: 44, bottom: CAP_BOTTOM }}>
              <CapBox text={l.text} />
            </div>
          </Sequence>
        );
      })}

      {/* 아웃트로 + ⑥ 질문형 CTA */}
      <Sequence from={durationInFrames - S(6)} durationInFrames={S(6)}>
        <Bg src={p.hookBg} dur={S(6)} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 60px' }}>
          <Out app={p.outro.app} line={p.outro.line} cta={p.cta} />
        </AbsoluteFill>
      </Sequence>

      {/* ①② 고정 배너 — 항상 위에 */}
      <Banner title={p.title} date={p.date} channel={p.channel} />

      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none' }}>
        <div style={{ fontFamily, marginBottom: 40, fontSize: 19, fontWeight: 700, color: 'rgba(214,224,240,0.7)' }}>
          Informational only. Not investment advice.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

function CapBox({ text }: { text: string }) {
  const p = useIn(0, 7);
  return (
    <div style={{
      opacity: p, transform: `translateY(${(1 - p) * 12}px)`,
      background: 'linear-gradient(180deg, rgba(24,34,56,0.96), rgba(11,17,30,0.94))',
      border: `1px solid ${C.line}`, borderRadius: 16, padding: '18px 24px',
    }}>
      <RichText text={text} size={42} />
    </div>
  );
}

function Out({ app, line, cta }: { app: string; line: string; cta: string }) {
  const a = useIn(2, 14), b = useIn(12, 14);
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ opacity: a }}>
        <div style={{ fontFamily, fontSize: 74, fontWeight: 900, color: C.head, letterSpacing: '-0.035em' }}>{app}</div>
        <div style={{ fontFamily, marginTop: 10, fontSize: 27, fontWeight: 700, color: C.ink }}>{line}</div>
      </div>
      <div style={{
        marginTop: 34, opacity: b,
        background: C.panel, border: `2px solid ${C.head}`, borderRadius: 20, padding: '22px 28px',
      }}>
        <RichText text={cta} size={38} />
      </div>
    </div>
  );
}
