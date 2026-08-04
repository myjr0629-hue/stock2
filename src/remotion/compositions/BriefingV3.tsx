// ============================================================================
// BriefingV3 — 레퍼런스(TIGER ETF 「60초 투자 뉴스」) 프레임 구조를 그대로
// ----------------------------------------------------------------------------
// 대표가 실제 프레임 5장을 보여주며: "이런 식으로 만들란 말이야, 배경도 그렇고."
//
// 레퍼런스 프레임에서 «직접 읽은» 구조 (추측 아님):
//   ① 배경 = **풀블리드 실사 사진/영상** (구글 간판 / 발언 중인 CEO / 회로기판 매크로)
//      — 내가 만든 V2는 그라디언트였다. 이게 가장 큰 차이다.
//   ② 화면 **상단 30%**에 텍스트 블록이 몰려 있다:
//        「01」 앰버 숫자 + 밑줄
//        작은 흰 아이브로 (알파벳 어닝 서프라이즈)
//        **거대한 앰버 헤드라인 2줄** ← 화면을 지배하는 요소
//        작은 회색 서브라인
//   ③ 차트는 장식용 선이 아니라 **리서치 차트**: 축·범례·데이터라벨·단위
//   ④ 하단에 **출처·면책** 작게 (*자료: Bloomberg… / *개별 종목 추천이 아닙니다)
//   ⑤ 배경은 아주 느린 연속 이동(켄번스) — §2-D에서 실측했던 그 성질
//
// 배경 소재: public/shorts/broll (기존 AI 생성 자산 16장). 의미가 맞는 것으로 배치.
//   반도체 이야기엔 회로기판, «정반대» 이야기엔 빨강↔청록 대비 이미지.
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
export const BRIEFING3_DURATION = 32 * FPS;

const C = {
  ink: '#FFFFFF',
  head: '#FFAA2B',          // 헤드라인 = 앰버. 레퍼런스에서 화면을 지배한 색
  sub: 'rgba(226,234,246,0.72)',
  faint: 'rgba(210,220,236,0.5)',
  up: '#3DE38F',
  down: '#FF5C74',
  panel: 'rgba(8,12,20,0.62)',
};

export interface Scene3 {
  /** 첫 컷 전용 — 번호·아이브로를 빼고 헤드라인부터 (리텐션) */
  hook?: boolean;
  /** 배경 이미지 (public/ 기준 경로) */
  bg: string;
  /** 켄번스 방향 */
  pan: 'in' | 'out' | 'left' | 'right';
  eyebrow: string;
  /** 거대 헤드라인 — 2줄 권장. \n 으로 줄바꿈 */
  head: string;
  subline: string;
  /** 하단 데이터 블록 (선택) */
  block?:
    | { kind: 'stat'; rows: Array<{ label: string; value: string; up: boolean }> }
    | { kind: 'chart'; title: string; unit: string; series: number[]; color: string; marks: Array<{ i: number; text: string }> }
    | { kind: 'mirror'; aLabel: string; aValue: string; bLabel: string; bValue: string; series: number[] }
    | { kind: 'app'; src: string; focus: { x: number; y: number; w: number }; note: string };
  /** 출처 한 줄 */
  source?: string;
}

export interface Briefing3Props {
  kicker: string;          // 「60초 투자 뉴스」 자리
  scenes: Scene3[];
  outro: { app: string; line: string; cta: string };
}

const S = (sec: number) => Math.round(sec * FPS);
const ease = Easing.bezier(0.16, 1, 0.3, 1);

function useIn(delay = 0, dur = 16) {
  const f = useCurrentFrame();
  return interpolate(f, [delay, delay + dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease,
  });
}

// ── 배경: 풀블리드 실사 + 켄번스 ────────────────────────────────────────────
// 레퍼런스 §2-D 실측 = «프레임간 차이는 0에 가깝지만 샷 처음↔끝 누적차가 크다».
// 정지 이미지 + 아주 느린 이동으로 정확히 그 성질을 만든다.
function PhotoBg({ src, pan, dur }: { src: string; pan: Scene3['pan']; dur: number }) {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, dur], [0, 1], { extrapolateRight: 'clamp' });
  const z = pan === 'in' ? 1.06 + t * 0.10 : pan === 'out' ? 1.18 - t * 0.10 : 1.12;
  const x = pan === 'left' ? -t * 4 : pan === 'right' ? t * 4 : 0;
  const y = pan === 'in' || pan === 'out' ? -t * 1.6 : 0;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#05070C' }}>
      <Img src={staticFile(src)} style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${z}) translate(${x}%, ${y}%)`,
        // 소재가 과채도 네온이라 살짝 진정시키고 대비를 준다
        filter: 'saturate(0.86) contrast(1.06) brightness(0.98)',
      }} />
      {/* 상단 스크림 — 텍스트가 어떤 사진 위에서도 읽히게. 하단은 열어둔다 */}
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, rgba(4,7,13,0.90) 0%, rgba(4,7,13,0.62) 34%, rgba(4,7,13,0.10) 56%, rgba(4,7,13,0.72) 100%)',
      }} />
    </AbsoluteFill>
  );
}

// ── 상단 타이포 블록 (레퍼런스 구조) ────────────────────────────────────────
function TopBlock({ n, kicker, eyebrow, head, subline, hook }: {
  n: number; kicker: string; eyebrow: string; head: string; subline: string; hook?: boolean;
}) {
  // [조사 반영 2026-08-04] 숏폼 리텐션 연구: 시청자는 1.5~3초에 결정하고,
  // «인내를 요구하는 오프닝»(로고·인사·긴 맥락·**타이틀 카드**)이 리텐션을 죽인다.
  // 레퍼런스는 구독자 있는 브랜드 채널이라 「01 …」 카드로 시작해도 되지만,
  // 우리는 구독자 0이다. → 첫 컷은 번호·아이브로를 빼고 **헤드라인부터** 때린다.
  const a = useIn(hook ? 0 : 2), b = useIn(hook ? 0 : 8), c = useIn(hook ? 0 : 4, hook ? 10 : 16);
  return (
    <div style={{ position: 'absolute', top: hook ? 300 : 86, left: 60, right: 60 }}>
      {/* 「01」 + 밑줄 — 훅 컷에서는 숨긴다 */}
      <div style={{ opacity: hook ? 0 : a, display: hook ? 'none' : 'block' }}>
        <div style={{ fontFamily, fontSize: 34, fontWeight: 900, color: C.head, letterSpacing: '0.04em' }}>
          {String(n).padStart(2, '0')}
        </div>
        <div style={{ marginTop: 6, width: 132, height: 3, background: C.head, borderRadius: 2 }} />
      </div>

      {/* 아이브로 */}
      {!hook && (
        <div style={{
          marginTop: 16, opacity: b, transform: `translateY(${(1 - b) * 12}px)`,
          fontFamily, fontSize: 27, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em',
        }}>{eyebrow}</div>
      )}

      {/* 거대 헤드라인 — 화면을 지배한다 */}
      <div style={{
        marginTop: hook ? 0 : 12, opacity: c, transform: `translateY(${(1 - c) * 18}px)`,
        fontFamily, fontSize: hook ? 96 : 76, lineHeight: 1.14, fontWeight: 900,
        color: C.head, letterSpacing: '-0.035em', whiteSpace: 'pre-line',
        textShadow: '0 6px 34px rgba(0,0,0,0.62)',
      }}>{head}</div>

      {/* 서브라인 */}
      <div style={{
        marginTop: 14, opacity: c,
        fontFamily, fontSize: 26, fontWeight: 600, color: C.sub, letterSpacing: '-0.005em',
      }}>{subline}</div>

      {/* 상단 우측 키커 */}
      <div style={{
        position: 'absolute', top: 4, right: 0, opacity: hook ? 0 : a,
        fontFamily, fontSize: 20, fontWeight: 800, color: C.faint, letterSpacing: '0.14em',
      }}>{kicker}</div>
    </div>
  );
}

// ── 리서치 스타일 차트 ──────────────────────────────────────────────────────
// 레퍼런스처럼 «축·범례·데이터라벨·단위»가 있어야 자료로 보인다. 장식선은 안 된다.
function ResearchChart({ title, unit, series, color, marks }: {
  title: string; unit: string; series: number[]; color: string; marks: Array<{ i: number; text: string }>;
}) {
  const p = useIn(10, 34);
  const W = 900, H = 380, PADL = 92, PADB = 46;
  const lo = Math.min(...series), hi = Math.max(...series);
  const span = hi - lo || 1;
  const px = (i: number) => PADL + (i / (series.length - 1)) * (W - PADL - 20);
  const py = (v: number) => (H - PADB) - ((v - lo) / span) * (H - PADB - 26);
  const pts = series.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const ticks = [lo, lo + span * 0.5, hi];

  return (
    <div style={{
      background: C.panel, border: '1px solid rgba(255,255,255,0.16)', borderRadius: 22,
      padding: '26px 26px 18px', backdropFilter: 'blur(3px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily, fontSize: 28, fontWeight: 800, color: C.ink }}>{title}</span>
        <span style={{ fontFamily, fontSize: 19, fontWeight: 700, color: C.faint }}>{unit}</span>
      </div>
      <svg width={W} height={H} style={{ display: 'block', marginTop: 10 }}>
        {/* 축 눈금 */}
        {ticks.map((tv, k) => (
          <g key={k}>
            <line x1={PADL} x2={W - 20} y1={py(tv)} y2={py(tv)} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
            <text x={PADL - 12} y={py(tv) + 7} textAnchor="end"
              style={{ fontFamily, fontSize: 19, fontWeight: 700, fill: 'rgba(226,234,246,0.62)' }}>
              {tv.toFixed(0)}
            </text>
          </g>
        ))}
        {/* 라인 (좌→우로 그려짐) */}
        <g clipPath="url(#rc)">
          <defs>
            <clipPath id="rc"><rect x="0" y="0" width={W * p} height={H} /></clipPath>
            <linearGradient id="rcf" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`${PADL},${H - PADB} ${pts} ${W - 20},${H - PADB}`} fill="url(#rcf)" />
          <polyline points={pts} fill="none" stroke={color} strokeWidth="5"
            strokeLinejoin="round" strokeLinecap="round" />
          {marks.map((m) => (
            <g key={m.i}>
              <circle cx={px(m.i)} cy={py(series[m.i])} r="8" fill={color} />
              <text x={px(m.i)} y={py(series[m.i]) - 20}
                textAnchor={m.i === 0 ? 'start' : m.i >= series.length - 2 ? 'end' : 'middle'}
                style={{ fontFamily, fontSize: 24, fontWeight: 900, fill: C.ink }}>{m.text}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

// ── 하단 데이터 블록들 ──────────────────────────────────────────────────────
function StatRows({ rows }: { rows: Array<{ label: string; value: string; up: boolean }> }) {
  return (
    <div style={{
      background: C.panel, border: '1px solid rgba(255,255,255,0.16)', borderRadius: 22,
      padding: '10px 26px', backdropFilter: 'blur(3px)',
    }}>
      {rows.map((r, i) => {
        const p = useIn(8 + i * 8, 14);
        return (
          <div key={r.label} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '22px 0', opacity: p, transform: `translateX(${(1 - p) * -14}px)`,
            borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none',
          }}>
            <span style={{ fontFamily, fontSize: 54, fontWeight: 900, color: C.ink, letterSpacing: '-0.02em' }}>
              {r.label}
            </span>
            <span style={{
              fontFamily, fontSize: 54, fontWeight: 900, color: r.up ? C.up : C.down,
              letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
            }}>{r.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function Mirror({ aLabel, aValue, bLabel, bValue, series }: {
  aLabel: string; aValue: string; bLabel: string; bValue: string; series: number[];
}) {
  const pa = useIn(8, 20), pb = useIn(20, 20);
  const lo = Math.min(...series), hi = Math.max(...series);
  const norm = series.map((v) => (v - lo) / ((hi - lo) || 1));
  const Row = ({ label, value, color, data, p }: any) => (
    <div style={{
      background: C.panel, border: '1px solid rgba(255,255,255,0.16)', borderRadius: 22,
      padding: '22px 26px', opacity: p, backdropFilter: 'blur(3px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily, fontSize: 24, fontWeight: 800, color: C.faint, letterSpacing: '0.1em' }}>{label}</span>
        <span style={{ fontFamily, fontSize: 66, fontWeight: 900, color, letterSpacing: '-0.03em' }}>{value}</span>
      </div>
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-end', gap: 7, height: 118 }}>
        {data.map((v: number, i: number) => (
          <div key={i} style={{
            flex: 1, height: `${14 + v * 86}%`, borderRadius: 3,
            background: color, opacity: 0.34 + v * 0.55,
          }} />
        ))}
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Row label={aLabel} value={aValue} color={C.down} data={norm} p={pa} />
      <Row label={bLabel} value={bValue} color={C.up} data={norm.map((v) => 1 - v)} p={pb} />
    </div>
  );
}

function AppPanel({ src, focus, note }: { src: string; focus: { x: number; y: number; w: number }; note: string }) {
  const p = useIn(8, 20);
  const scale = 1 / focus.w;
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
      <div style={{
        width: '100%', height: 430, borderRadius: 24, overflow: 'hidden', position: 'relative',
        border: '1px solid rgba(255,255,255,0.20)', boxShadow: '0 26px 70px rgba(0,0,0,0.6)',
      }}>
        <Img src={staticFile(src)} style={{
          position: 'absolute', width: `${scale * 100}%`,
          left: `${-focus.x * scale * 100}%`, top: `${-focus.y * scale * 100}%`,
          filter: 'brightness(1.30) contrast(1.10)',
        }} />
      </div>
      <div style={{
        marginTop: 14, fontFamily, fontSize: 26, fontWeight: 900,
        color: C.head, letterSpacing: '0.04em', textAlign: 'center',
      }}>{note}</div>
    </div>
  );
}

// ── 본체 ────────────────────────────────────────────────────────────────────
export const BriefingV3: React.FC<Briefing3Props> = (p) => {
  const { durationInFrames } = useVideoConfig();
  const per = Math.floor((durationInFrames - S(5)) / p.scenes.length);

  return (
    <AbsoluteFill style={{ background: '#05070C' }}>
      {p.scenes.map((sc, i) => (
        <Sequence key={i} from={i * per} durationInFrames={per}>
          <PhotoBg src={sc.bg} pan={sc.pan} dur={per} />
          <TopBlock n={i} kicker={p.kicker} eyebrow={sc.eyebrow} head={sc.head}
            subline={sc.subline} hook={sc.hook} />
          {sc.block && (
            <div style={{ position: 'absolute', left: 60, right: 60, bottom: 150 }}>
              {sc.block.kind === 'stat' && <StatRows rows={sc.block.rows} />}
              {sc.block.kind === 'chart' && (
                <ResearchChart title={sc.block.title} unit={sc.block.unit} series={sc.block.series}
                  color={sc.block.color} marks={sc.block.marks} />
              )}
              {sc.block.kind === 'mirror' && (
                <Mirror aLabel={sc.block.aLabel} aValue={sc.block.aValue}
                  bLabel={sc.block.bLabel} bValue={sc.block.bValue} series={sc.block.series} />
              )}
              {sc.block.kind === 'app' && (
                <AppPanel src={sc.block.src} focus={sc.block.focus} note={sc.block.note} />
              )}
            </div>
          )}
          {/* 출처 — 레퍼런스처럼 하단에 작게 */}
          {sc.source && (
            <div style={{
              position: 'absolute', left: 60, right: 60, bottom: 108,
              fontFamily, fontSize: 18, fontWeight: 600, color: 'rgba(210,220,236,0.55)',
            }}>{sc.source}</div>
          )}
        </Sequence>
      ))}

      {/* 아웃트로 */}
      <Sequence from={p.scenes.length * per} durationInFrames={durationInFrames - p.scenes.length * per}>
        <PhotoBg src="shorts/broll/v25_scene7_outro.png" pan="in" dur={S(5)} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: '0 70px' }}>
          <Rise2>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily, fontSize: 82, fontWeight: 900, color: C.head,
                letterSpacing: '-0.035em', textShadow: '0 6px 34px rgba(0,0,0,0.6)',
              }}>{p.outro.app}</div>
              <div style={{ fontFamily, marginTop: 14, fontSize: 30, fontWeight: 700, color: C.ink }}>
                {p.outro.line}
              </div>
              <div style={{
                marginTop: 30, display: 'inline-block', fontFamily, fontSize: 27, fontWeight: 900,
                color: '#0A0E16', background: C.head, borderRadius: 999, padding: '15px 42px',
              }}>{p.outro.cta}</div>
            </div>
          </Rise2>
        </AbsoluteFill>
      </Sequence>

      {/* 상시 면책 — 레퍼런스도 하단에 고정으로 달고 있다 */}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', pointerEvents: 'none' }}>
        <div style={{
          fontFamily, marginBottom: 52, fontSize: 20, fontWeight: 700,
          color: 'rgba(214,224,240,0.72)', letterSpacing: '0.01em',
        }}>
          Informational only. Not investment advice.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

function Rise2({ children }: { children: React.ReactNode }) {
  const p = useIn(4, 20);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 26}px)` }}>{children}</div>;
}
