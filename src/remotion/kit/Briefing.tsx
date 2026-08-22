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

import { createContext, useContext } from 'react';
import {
  AbsoluteFill, OffthreadVideo, Audio, Img, Sequence, interpolate, staticFile,
  delayRender, continueRender,
  useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { AppShot, type ShotFocus, type ShotCallout } from '../components/AppShot';
import { Backdrop, type BackdropSpec, type BackdropData } from './Backdrop';
import { bestStartFrame } from './clip-motion';
import { CANVAS, SAFE, CAPTION, PACE, C, BACKDROP_FOR, HOOK_BACKDROP, type BeatRole } from './spec';
import { TickerMark, SymbolHero } from '../components/TickerMark';
import { TickerField } from '../components/TickerField';
import { SYM, resolveSymbol } from './symbols';
import { AppPlate } from './AppPlate';
import { EndCard } from './EndCard';

// ⛔ 일본 채널(@signum_jp) 대응 — Inter 에는 «일본어 글리프가 없다».
//   그대로 두면 가나·한자가 두부(□)로 렌더된다.
//   ⇒ 글꼴 «스택»으로 둔다. 라틴 글자는 항상 앞의 Inter 가 먼저 먹고,
//     Inter 에 없는 일본어만 Noto Sans JP 가 받는다.
//     그래서 기존 영어 편의 렌더 결과는 «한 픽셀도 바뀌지 않는다».
//
// ⛔ 왜 @remotion/google-fonts 를 안 쓰는가 (2026-08-21 실측)
//   NotoSansJP 는 «japanese» 라는 서브셋 이름이 없다. 일본어 글리프가
//   [0]~[119] 120개 조각으로 쪼개져 있어서, 굵기 3개를 받으면 요청이 360건이 된다.
//   (Inter 만으로도 이미 126건 경고가 뜬다.)
//   ⇒ 필요한 굵기 2개만 «직접 받아» public/fonts 에 두고 self-host 한다.
//     렌더가 네트워크에 안 매이고, 다시 렌더해도 결과가 같다.
const { fontFamily: FONT_LATIN } = loadFont();
const FONT_JP = 'NotoSansJP';
const fontFamily = `${FONT_LATIN}, ${FONT_JP}, sans-serif`;

// ⛔ 글꼴이 «도착하기 전에» 프레임이 찍히면 그 프레임만 두부로 나온다.
//   delayRender 로 붙잡았다가 실제 로드가 끝나면 놓는다.
if (typeof document !== 'undefined' && !document.getElementById('signum-jp-font')) {
  const handle = delayRender('Noto Sans JP');
  const el = document.createElement('style');
  el.id = 'signum-jp-font';
  el.textContent = [700, 900].map((w) =>
    `@font-face{font-family:'${FONT_JP}';font-style:normal;font-weight:${w};font-display:block;`
    + `src:url(${staticFile(`fonts/NotoSansJP-${w}.woff2`)}) format('woff2');}`).join('');
  document.head.appendChild(el);
  Promise.all([
    document.fonts.load(`700 100px '${FONT_JP}'`),
    document.fonts.load(`900 100px '${FONT_JP}'`),
  ]).then(() => continueRender(handle)).catch(() => continueRender(handle));
}
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
  /** ★ 2026-08-20 승격 — 스파크라인에서 «ICT 계급 차트»로.
   *  레퍼런스 3계급 어디도 «숫자 3줄 카드»로만 말하지 않는다.
   *  ICT Gems(17.6만)는 «실제 차트에 실제 레벨»을 짚는다. levels/marks/panel 이 그 문법이다. */
  | { kind: 'chart'; series: number[]; label: string; value: string; pct: string; up: boolean;
      /** 수평 레벨 — 맥스페인·감마플립·VWAP 처럼 «실제 값»만 */
      levels?: Array<{ v: number; label: string; tone?: 'accent' | 'hot' | 'cool' }>;
      /** 짚을 지점 — 돌파·이벤트일. i 는 series 인덱스 */
      marks?: Array<{ i: number; label?: string }>;
      /** 하단 지표 패널 (0~100 스케일). RSI 등 */
      panel?: { series: number[]; label: string; hi?: number; lo?: number };
      axis?: boolean };

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
  /**
   * ★ 우선순위 — «짧은 판»을 만들 때 무엇을 남길지 (kit/variants.ts)
   *   1 = 이야기의 뼈대. 빼면 말이 안 된다
   *   2 = 근거를 두껍게 한다. 빼도 이야기는 선다
   *   3 = 보너스 레이어. 긴 판에서만
   * 없으면 2로 본다.
   */
  prio?: 1 | 2 | 3;
}

export interface BriefingProps {
  /** 고정 배너 훅 제목 — 중간 유입자도 3초 안에 뭘 보는지 알게 */
  title: string;
  date: string;
  /** hook.syms = 프레임0 지배 요소. 1개면 단독, 2~3개면 클러스터 (§1-3) */
  hook: {
    line: string; sub: string; role?: BeatRole; bg?: string | BackdropSpec; syms?: string[]; stamp?: string;
    /** 프레임0 지배 요소로 쓸 «거대 숫자» (예: '+0.1%'). 폰 썸네일에서 유일하게 읽히는 것 */
    bigNum?: string;
    /**
     * ★ 반전 훅 — 「상식과 반대」를 «화살표 2개»로 만든다.
     *   폰 썸네일 폭은 ≈210px 다. 88px 문장은 17px, 40px 서브는 8px 로 줄어 «안 읽힌다».
     *   그 크기에서 살아남는 것은 «색 블록과 도형»뿐이다. 그래서 방향을 그림으로 그린다.
     *   down = 내려간다고 «믿는» 것 / up = 실제로 «오르는» 것.
     */
    flip?: { down: string; up: string };
    /**
     * ★ 훅 «낭독 전용» 문장. 없으면 line 을 읽는다.
     *   화면에는 'down 25%' 라고 써야 뜻이 통하는데, TTS 는 그걸
     *   'down twenty-five percent' 로 읽어 낭독이 길어진다.
     *   낭독이 길어지면 훅이 길어지고 → 첫 컷이 밀리고 → 지속률이 떨어진다(상관 -0.90).
     *   실측: 'Micron: down 25%. Up 198%.' 는 2.87초 → 훅 3.32초 (승자밴드 2.8초 초과)
     *   그래서 «보는 문장»과 «읽는 문장»을 분리한다.
     */
    say?: string;
  };
  beats: Beat[];
  /** ⛔ noOutro 대본은 이 블록이 없다 (2026-08-22) */
  outro?: {
    app: string; line: string; ask: string;
    /**
     * ★ 폰 목업 엔드카드 — 대표 지시(2026-08-19):
     *   "앱 아이콘만 넣지 말고 «실제 주요 화면»을 폰 안에 넣고, 기관급 지표를 자막으로
     *    나열하면서 free 를 강조해라. 보통 광고 영상이 그렇게 한다."
     *   조사도 같은 방향이다: 「스크린샷을 3D 디바이스 프레임에 넣고 핵심 기능을 헤드라인으로,
     *   명시적 CTA(Download free / Available on iOS & Android), 스토어 배지를 엔드프레임에」
     *   (2026 앱 프로모 관례. 모바일 영상의 80%가 «음소거» 시청 → 온스크린 텍스트 필수)
     *
     *   endcard 를 켜면 CtaBlock 대신 EndCard(폰+궤도패널+아이콘+CTA)를 쓴다.
     *   ⚠️ 앱 화면은 «실캡처»만 (endcards.ts §8). AI 가 그린 UI 는 절대 금지.
     */
    endcard?: boolean;
    /** 폰 위에 겹칠 «기관급 지표» 나열. 음소거 시청자에게 값을 보여준다 */
    metrics?: string[];
  };
  /** 마지막이 첫 화면으로 이어지는 루프백 문장 */
  loop: string;
  /**
   * ⛔ 정적 아웃트로(앱 광고 카드)를 «빼고» 마지막 비트를 바로 루프로 넘긴다.
   *   왜 생겼나 (2026-08-22 실측): 일본 첫 영상 pt9HSA9y82g 의 23초 프레임이
   *   통째로 「SIGNUM HQ FREE - iOS & Android」 정지 카드였다. 쇼츠에서 «정지 화면»은
   *   시청자에게 「끝났다」 신호이고, 그 순간 스와이프된다 — 루프가 끊긴다.
   *   ⚠ 미국 채널은 앱 유입이 사업 목적이라 «기본은 켬»이다. 끄는 것은 채널 판단.
   */
  noOutro?: boolean;
  /**
   * 롱폼(8분+) 판. 길이창 자르기를 건너뛰고, 챕터 표지를 그린다.
   *   근거: .agent/LONGFORM_RESEARCH.md — 검증된 포맷을 그대로 빌린다.
   */
  longform?: boolean;
  /** 챕터 표지 — beats 인덱스에 붙는다. { at: 비트번호, no: 표시번호, title: 제목 } */
  chapters?: Array<{ at: number; no: string; title: string }>;
  /** 절차 배경이 쓸 실데이터 (seed=티커, series=당일 시계열 등) */
  data?: BackdropData;
  /** 하단 티커 테이프 — 캡처 .txt 와 같은 순간의 시장 값들 (플랫폼 UI에 덮여도 되는 존) */
  tape?: Array<{ t: string; v: string; up?: boolean }>;
  /**
   * ★ 그날 주목 종목 — «실제 로고»가 배경에 흩뿌려진다 (components/TickerField).
   * 일반 시청자는 숫자보다 심볼을 먼저 본다(대표 지시 2026-08-11).
   * 로고 파일이 없는 티커는 조용히 빠진다 — 배경에 글자는 넣지 않는다.
   */
  field?: string[];
  /** 면책 밴드 상단 라벨 */
  readLabel?: string;
  /** 면책 본문 — «의견»이 들어가는 영상은 이 문구가 더 길어진다 */
  disclaimer?: string;
  /** 브리핑 계급 페이스 — 비트 안 중간컷을 끈다 (컷/분 6.5~16.5 실측) */
  slowCuts?: boolean;
  /** ★ ElevenLabs 음성 트랙 (scripts/tts-beats.mjs 가 생성).
      낭독 «실측» 길이가 컷 길이의 정답이 된다 — 글자수 추정(msFor)을 대체. */
  voice?: VoiceTrack;
}

export interface VoiceSeg {
  f: string;
  /** 이 비트의 «전체» 낭독 길이 (say + 숨 + ask) */
  sec: number;
  /** say 만의 실측 길이 — ask 자막이 «말이 나오는 순간»에 뜨게 하는 기준 */
  saySec?: number;
  /** ask 는 별도 파일이다. 합쳐 구우면 자막 시점을 알 수 없다. */
  ask?: { f: string; sec: number };
}
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
// ⛔ 롱폼은 숨을 더 준다 (2026-08-22 실측)
//   쇼츠 값(+0.35초)을 8분짜리에 그대로 쓰면 영상의 91% 가 «말하는 시간»이 된다.
//   레퍼런스 분당 879자 vs 우리 1,137자 — 말이 많은 게 아니라 쉬지 않은 것이었다.
//   +2.2초를 주면 같은 대본이 5:40 → 7:20 이 되고 분당 글자가 레퍼런스에 맞는다.
//   ⚠ 쇼츠는 절대 건드리지 않는다 — 31~38초에서 2초는 치명적이다.
const BREATH_LONGFORM = 2.2;
const secFor = (b: Beat, seg?: VoiceSeg | null, lf = false) => {
  const breath = lf ? BREATH_LONGFORM : 0.35;
  return seg ? Math.max(baseSecFor(b), seg.sec + breath) : baseSecFor(b);
};

/** 훅/CTA/루프 길이 — 음성이 스펙 기본값보다 길면 음성을 따른다 */
export function timingOf(p: BriefingProps) {
  const v = p.voice;
  /**
   * ★★ 훅 길이 = «첫 컷이 언제 오는가» 다. 이게 지속률을 지배한다.
   *
   * 2026-08-19 자사 쇼츠 9편 전수 실측 (YouTube 스튜디오 지속률 × ffmpeg 첫컷 시각):
   *   첫컷 ≤2.8초  → 지속률 평균 100.6%  (111.4 / 100.6 / 89.7)   ← 상위 3편 전부
   *   첫컷  3.0초  → 지속률 평균  48.5%
   *   첫컷 ≥3.7초  → 지속률 평균  29.6%  (17.1 / 42.1)
   *   순위상관 «-0.90» — 빠를수록 좋다. 거의 완전한 단조 관계다.
   *   (상단 밝기는 +0.13 으로 거의 무관했다 — 눈으로는 그게 원인처럼 보였지만 아니었다)
   *
   * 예전 공식은 `Math.max(3.0, 낭독+0.25)` 였다. 낭독이 1.3초여도 3.0초로 «강제»되어
   * 낭독이 끝난 뒤 1.7초 동안 정지 화면이 남았고, 시청자는 그 정지 구간에서 나갔다
   * (04_MORNING 실측: 첫컷 3.73초 · 평균 시청 «4초» · 지속률 17.1%).
   *
   * ⚠️ 상한은 두지 않는다 — 자르면 훅 음성이 끊긴다. 대신 «대본 규칙»으로 잡는다:
   *    훅 문장은 32자 이내 (= 낭독 2.3초 이내 = 첫컷 2.75초 이내).
   */
  const hookSec = v?.hook ? Math.max(2.0, v.hook.sec + 0.45) : PACE.hookSec;
  const beatSecs = p.beats.map((b, i) => secFor(b, v?.beats?.[i], !!p.longform));
  // ⛔ 낭독 끝나자마자 잘라내면 끝 장면이 «스쳐 지나간다» (대표 확인 2026-08-21).
  //    폰·지표칩·구독줄·앱주소를 읽을 시간이 필요하다. 낭독 뒤 1.4초를 준다.
  //    ⚠ 길이가 늘면 평균 조회율의 분모가 커진다 — 그래서 «최소한만» 늘린다.
  const ctaSec = p.noOutro ? 0 : v?.outro ? Math.max(3.2, v.outro.sec + 1.4) : 3.2;
  const loopSec = v?.loop ? Math.max(PACE.loopSec, v.loop.sec + 0.2) : PACE.loopSec;
  return { hookSec, beatSecs, ctaSec, loopSec };
}

const Say2 = ({ v, seg }: { v?: VoiceTrack; seg?: VoiceSeg | null }) => {
  const { fps } = useVideoConfig();
  if (!v || !seg) return null;
  return (
    <>
      <Audio src={staticFile(`${v.base}/${seg.f}`)} />
      {seg.ask && (
        // say 실측 + 숨(0.18s) 지점에서 시작 — 자막도 «같은 프레임»에 바뀐다
        <Sequence from={Math.round(((seg.saySec ?? 0) + 0.18) * fps)}>
          <Audio src={staticFile(`${v.base}/${seg.ask.f}`)} />
        </Sequence>
      )}
    </>
  );
};

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

// ── 하단 존 ────────────────────────────────────────────────────────────────
// ★ 2026-08-17 세이프존 교정 (Casual.tsx 와 동일 규칙 적용).
//   구판은 «덮여도 되는 것»이라며 UI 존 안에 뒀는데, 실제 모바일 UI 를 겹쳐 재보니
//   덮이는 정도가 아니라 «정면 충돌»이었다:
//     · 브랜드 워터마크 y≈1544 → 유튜브가 바로 그 줄에 @SIGNUMHQ 채널명을 그린다
//       (화면에 SIGNUM HQ 가 두 개 겹쳐 나온다) → «삭제». 상단 TitleBand 가
//       영상 내내 로고+SIGNUM HQ 를 이미 보여준다. 브랜딩 손실 0
//     · 티커 테이프 y≈1778 → 유튜브 음원 표시줄과 겹쳐 사실상 안 보인다
//       → y≈1402~1458 로 «올린다». 뉴스 티커는 보여야 의미가 있다
//   UI 존은 y>1536 (1080x1920 기준 실측). 이 함수의 모든 요소는 그 «위»에 둔다.
function BottomZone({ tape }: { tape?: Array<{ t: string; v: string; up?: boolean }> }) {
  const f = useCurrentFrame();
  const items = tape ?? [];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 30, pointerEvents: 'none' }}>
      {items.length > 0 && (
        <div style={{
          // ★ 2026-08-20 — 티커를 «상단»으로 옮겼다.
          //   자막을 레퍼런스 밴드(67~78%)로 내리자 티커(y1400~1458)와 정면으로 겹쳤다
          //   — 실제 프레임에서 ask 문구가 티커에 잘렸다.
          //   레퍼런스 3계급 어디에도 하단 스크롤 티커는 없다. 상단이 시황 채널의 자리다.
          position: 'absolute', left: 0, right: 0, bottom: 390, height: 50, overflow: 'hidden',
          borderTop: '1px solid rgba(255,255,255,0.10)', borderBottom: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(6,10,18,0.55)',
        }}>
          <div style={{ display: 'flex', whiteSpace: 'nowrap', transform: `translateX(${-(f * 2.2)}px)`   /* mod 래핑은 내용폭≠주기라 이음매가 튄다 */, padding: '11px 0' }}>
            {[0, 1, 2, 3].map((rep) => items.map((it, i) => (
              <span key={`${rep}-${i}`} style={{ fontFamily, fontSize: 23, fontWeight: 800, padding: '0 28px', display: 'inline-flex', gap: 10 }}>
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
function Say({ text, ask, askAt }: { text: string; ask?: string; askAt?: number }) {
  const g = useGeo();
  const p = useIn(0, 6);
  // ★ ask 자막은 «말이 시작되는 프레임»에 뜬다 (2026-08-11 실측: 고정 22프레임은 최대 2초 어긋남)
  // ★ 2026-08-20 — 9프레임 교차페이드는 «컷»으로 검출됐다 (컷/분 30 → 46.5).
  //   레퍼런스 최대가 22.8컷/분인데 우리가 두 배였다. 디졸브는 컷이 아니어야 한다.
  const q = useIn(Math.max(0, (askAt ?? 22) - 4), 18);
  // 16:9 는 자막 폭이 1728px 라 줄당 글자 상한이 다르다 (2026-08-22)
  const CAP_MAX = g.lf ? 44 : undefined;
  const lines = CAPTION.wrap(text, CAP_MAX);
  const askLines = ask ? CAPTION.wrap(ask, CAP_MAX) : [];
  // ★ 2026-08-20 — «한 슬롯, 한 자막».
  //   전: say 상자 아래에 ask 상자를 «쌓았다» → 두 상자 높이 때문에 say 가 화면 52~65% 로 밀려
  //       레퍼런스 밴드(76~80%, DayTrade Warrior 실사)를 한참 벗어났다. shorts-gate 가 잡았다.
  //   후: 같은 자리에서 교차 페이드. 레퍼런스는 전부 «한 번에 한 줄»이다.
  const slot: React.CSSProperties = {
    position: 'absolute', left: g.pad, right: g.lf ? g.pad : SAFE.right, bottom: g.capBottom,
  };
  return (
    <>
      <div style={{ ...slot, opacity: p * (1 - q), transform: `translateY(${(1 - p) * 12}px)` }}>
        <div style={{
          background: C.capBg, border: `1px solid ${C.line}`, borderRadius: 18,
          padding: '20px 26px', backdropFilter: 'blur(4px)',
        }}>
          {lines.map((l, i2) => (
            <div key={i2} style={{
              fontFamily, fontSize: CAPTION.sizeFor(lines.length), lineHeight: CAPTION.lineHeight,
              fontWeight: 900, color: C.ink, letterSpacing: '-0.025em',
            }}>{l}</div>
          ))}
        </div>
      </div>
      {ask && (
        <div style={{ ...slot, opacity: q, transform: `translateY(${(1 - q) * 10}px)` }}>
          <div style={{
            // ⛔ 반투명 앰버는 밝은 배경 위에서 «앰버 글자»와 붙어 안 읽혔다 (paper-crowd 실측)
            background: 'rgba(6,10,18,0.92)', border: `2px solid ${C.head}`,
            borderRadius: 18, padding: '20px 26px', backdropFilter: 'blur(4px)',
          }}>
            {askLines.map((l, i2) => (
              <div key={i2} style={{
                fontFamily, fontSize: CAPTION.sizeFor(askLines.length), lineHeight: CAPTION.lineHeight,
                fontWeight: 900, color: C.head, letterSpacing: '-0.025em',
              }}>{l}</div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── 상단 타이포 ─────────────────────────────────────────────────────────────
function Head({ n, eyebrow, head }: { n: number; eyebrow?: string; head: string }) {
  const g = useGeo();
  const a = useIn(1, 8), b = useIn(4, 10);
  return (
    <div style={{ position: 'absolute', top: g.headTop, left: g.pad, right: g.pad }}>
      <div style={{ opacity: a, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily, fontSize: 27, fontWeight: 900, color: C.head, letterSpacing: '0.05em' }}>
          {String(n).padStart(2, '0')}
        </span>
        <div style={{ width: 72, height: 3, background: C.head, borderRadius: 2 }} />
        {/* ⛔ 밝은 배경에서 회색 글자가 묻힌다 — 얇은 스크림을 깐다 (2026-08-21) */}
        {eyebrow && <span style={{
          fontFamily, fontSize: 21, fontWeight: 700, color: '#EEF3FB',
          background: 'rgba(6,9,16,0.55)', borderRadius: 7, padding: '3px 10px',
          textShadow: '0 2px 8px rgba(0,0,0,0.9)',
        }}>{eyebrow}</span>}
      </div>
      {/* ⛔ 2026-08-21: 밝은 배경(fiber-one-lit 157)에서 금색 제목이 «묻혔다».
          에이브로우·면책은 스크림을 깔았는데 정작 제일 큰 글자는 안 깔았다.
          줄마다 어두운 슬래브를 깐다 — 배경 밝기와 무관하게 읽힌다. */}
      <div style={{ marginTop: 10, opacity: b, transform: `translateY(${(1 - b) * 12}px)` }}>
        {head.split('\n').map((ln, i) => (
          // 바깥은 블록(줄바꿈 강제), 안쪽 span 이 글자폭만큼만 슬래브를 깐다.
          // inline-block 만 쓰면 두 줄이 «나란히» 붙어 한 줄로 보인다 (2026-08-21 확인).
          <div key={i} style={{ display: 'block', marginBottom: 5 }}>
            <span style={{
              display: 'inline-block', background: 'rgba(6,9,16,0.62)',
              borderRadius: 8, padding: '2px 12px 6px',
              fontFamily, fontSize: 62, lineHeight: 1.12, fontWeight: 900, color: C.head,
              letterSpacing: '-0.035em', textShadow: '0 4px 22px rgba(0,0,0,0.9)',
            }}>{ln}</span>
          </div>
        ))}
      </div>
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
    const CW = w - 52;
    const PH = v.panel ? Math.min(206, h - 300) : Math.min(300, h - 150);
    const NH = v.panel ? 96 : 0;
    // 레벨이 있으면 «레벨까지» 보이도록 축을 넓힌다 — 레벨이 프레임 밖이면 의미가 없다
    const vals = [...v.series, ...(v.levels || []).map((L) => L.v)];
    const lo0 = Math.min(...vals), hi0 = Math.max(...vals), pad = (hi0 - lo0) * 0.08 || 1;
    const lo = lo0 - pad, sp = (hi0 + pad) - lo || 1;
    const X = (i: number) => (i / (v.series.length - 1)) * CW;
    const Y = (x: number) => (PH - 14) - ((x - lo) / sp) * (PH - 34);
    const pts = v.series.map((x, i) => `${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join(' ');
    const col = v.up ? C.cool : C.hot;
    const TONE = { accent: C.head, hot: C.hot, cool: C.cool } as const;
    // 지표 패널 (0~100)
    const PY = (x: number) => NH - 10 - (x / 100) * (NH - 20);
    const ppts = v.panel ? v.panel.series.map((x, i) =>
      `${((i / (v.panel!.series.length - 1)) * CW).toFixed(1)},${PY(x).toFixed(1)}`).join(' ') : '';
    return (
      <div style={box}><Card>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily, fontSize: 21, fontWeight: 800, color: C.faint, letterSpacing: '0.1em' }}>{v.label}</div>
            <div style={{ fontFamily, fontSize: 62, fontWeight: 900, color: C.ink, letterSpacing: '-0.04em' }}>{v.value}</div>
          </div>
          <div style={{ fontFamily, fontSize: 52, fontWeight: 900, color: col, letterSpacing: '-0.035em' }}>{v.pct}</div>
        </div>
        <div style={{ marginTop: 10 }}>
          <svg width={CW} height={PH} style={{ display: 'block' }}>
            {(v.levels || []).map((L) => (
              <g key={L.label}>
                <line x1={0} y1={Y(L.v)} x2={CW} y2={Y(L.v)} stroke={TONE[L.tone ?? 'accent']}
                  strokeWidth={4} strokeDasharray="12 8" opacity={0.95} />
                <text x={6} y={Y(L.v) - 10} fill={TONE[L.tone ?? 'accent']} fontFamily={fontFamily}
                  fontSize={24} fontWeight={900}>{L.label}</text>
              </g>
            ))}
            <g style={{ clipPath: `inset(0 ${(1 - d) * 100}% 0 0)` }}>
              <polyline points={pts} fill="none" stroke={col} strokeWidth={5}
                strokeLinejoin="round" strokeLinecap="round" />
            </g>
            {(v.marks || []).map((m) => (
              <circle key={m.i} cx={X(m.i)} cy={Y(v.series[m.i])} r={10} fill={C.head}
                opacity={d > (m.i / v.series.length) ? 1 : 0} />
            ))}
          </svg>
          {v.panel && (
            <svg width={CW} height={NH} style={{ display: 'block', marginTop: 8 }}>
              <rect x={0} y={0} width={CW} height={NH} rx={8} fill="rgba(10,20,36,0.4)"
                stroke="rgba(226,240,255,0.2)" strokeWidth={2} />
              {v.panel.hi !== undefined && (
                <line x1={0} y1={PY(v.panel.hi)} x2={CW} y2={PY(v.panel.hi)} stroke={C.hot}
                  strokeWidth={3} strokeDasharray="10 7" />
              )}
              <g style={{ clipPath: `inset(0 ${(1 - d) * 100}% 0 0)` }}>
                <polyline points={ppts} fill="none" stroke={C.head} strokeWidth={4}
                  strokeLinejoin="round" strokeLinecap="round" />
              </g>
              <text x={8} y={22} fill={C.head} fontFamily={fontFamily} fontSize={20} fontWeight={900}>{v.panel.label}</text>
            </svg>
          )}
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

// ── 레이아웃 컨텍스트 — 세로(쇼츠) vs 16:9(롱폼) ────────────────────────────
// ⛔ 2026-08-22: 롱폼 첫 렌더가 1080x1920 세로로 나왔다. 조사한 롱폼 레퍼런스는
//   전부 16:9 다. 세로 전용으로 박아둔 픽셀값을 여기서 한 번에 갈아끼운다.
//   ⚠ 안전영역이 다르다 — 쇼츠는 상·하단을 플랫폼 UI 가 덮지만 일반 영상은 안 덮는다.
type Geo = {
  lf: boolean; W: number; H: number;
  top: number; bottom: number; pad: number;
  capBottom: number; bannerTop: number; headTop: number; visTop: number;
  discBottom: number; loopTop: number;
  visMaxW: number;
};
const GEO_V: Geo = {
  lf: false, W: 1080, H: 1920,
  top: 384, bottom: 1440, pad: 44,
  capBottom: 460, bannerTop: 384 - 174, headTop: 384 - 174, visTop: 384 + 40,
  discBottom: 330, loopTop: 240,
  visMaxW: 1080 - 88,
};
const GeoCtx = createContext<Geo>(GEO_V);
const useGeo = () => useContext(GeoCtx);
const geoFor = (lf: boolean, W: number, H: number): Geo => (lf
  ? {
      lf: true, W, H,
      top: Math.round(H * 0.10), bottom: Math.round(H * 0.94), pad: 96,
      capBottom: 56, bannerTop: 34, headTop: 186, visTop: 470,
      discBottom: 18, loopTop: Math.round(H * 0.36),
      visMaxW: 1180,
    }
  : GEO_V);

// ── 본체 ────────────────────────────────────────────────────────────────────
export const Briefing: React.FC<BriefingProps> = (p) => {
  const { durationInFrames, width, height } = useVideoConfig();
  const g = geoFor(!!p.longform, width, height);
  const PAD = g.pad;
  const VIS_TOP = g.visTop;   // [2026-08-07] 배너-헤드 «딱 붙음» 해소로 헤드가 내려온 만큼
  // 자막 실측 높이: 본문 2줄(74*1.22*2=180) + 패딩 40 + 질문(2줄 52*1.2=125 + 패딩 32 + 여백 12)
  const CAP_BLOCK_H = g.lf ? 236 : 180 + 40 + 125 + 32 + 12;   // 389 (세로)
  const CAP_TOP = (g.lf ? height - g.capBottom : SAFE.bottom) - 24 - CAP_BLOCK_H;
  const VIS_H = Math.max(g.lf ? 240 : 320, CAP_TOP - VIS_TOP - 20);
  const VIS_W = Math.min(g.visMaxW, width - PAD * 2);

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
  const hookBgRaw: BackdropSpec = p.hook.bg
    ? (typeof p.hook.bg === 'string' ? { kind: 'img', src: p.hook.bg } : p.hook.bg)
    : p.hook.role ? BACKDROP_FOR[p.hook.role] : HOOK_BACKDROP;

  // ⛔ 훅 첫 프레임이 «정지»면 스와이프된다 (2026-08-21 조사·실측)
  //   쇼츠 배포의 단일 최대 신호는 VVSA(보고 남는가 vs 넘기는가)다.
  //   뇌가 «뭔가 벌어지고 있다»고 등록해야 손가락이 멈춘다.
  //
  //   ★ 우리는 영상을 «코드»로 만든다 — 클립의 어느 지점에서 시작할지 고를 수 있다.
  //     실측해보니 우리 훅 클립들이 0초에서 거의 정지였다:
  //       ani-dominoes    0초 3.99 vs 최고 25.02  → 6.3배 손해
  //       ani-bell-strike 0초 3.27 vs 최고 32.35  → 9.9배 손해
  //
  //   ⇒ 대본이 startFrom 을 «안 적어도» 자동으로 최고 동작 구간에서 시작한다.
  //     기억에 맡기면 잊는다. (clip-motion.ts 는 scripts/clip-motion.mjs 가 생성)
  const hookBg: BackdropSpec = (hookBgRaw.kind === 'video' && hookBgRaw.startFrom === undefined)
    ? { ...hookBgRaw, startFrom: bestStartFrame(hookBgRaw.src, CANVAS.fps) }
    : hookBgRaw;
  const data = p.data ?? {};

  return (
    <GeoCtx.Provider value={g}>
    <AbsoluteFill style={{ background: '#05070C' }}>
      {/* 훅 */}
      <Sequence durationInFrames={hookF}>
        <Backdrop spec={hookBg} dur={hookF} data={data} punch />
        {p.field?.length ? <TickerField tickers={p.field} seed={`${p.date}|hook`} opacity={0.16} exclude={p.hook.syms} /> : null}
        {/* ★ 훅 안의 펀치 컷 — 첫 컷을 2.8초 안으로 (지속률 상관 -0.90, 유일한 신호) */}
        {hookF > F(2.4) && (
          <Sequence from={F(2.1)} durationInFrames={hookF - F(2.1)}>
            <Backdrop spec={hookBg} dur={hookF - F(2.1)} data={data} tone={1.5} />
            <CutFlash />
          </Sequence>
        )}
        <Say2 v={p.voice} seg={p.voice?.hook} />
        <AbsoluteFill style={{ justifyContent: 'center', padding: `0 ${PAD}px`, paddingTop: 120 }}>
          <HookBlock line={p.hook.line} sub={p.hook.sub} date={p.hook.stamp ?? p.date} syms={p.hook.syms} bigNum={p.hook.bigNum} flip={p.hook.flip} />
        </AbsoluteFill>
      </Sequence>

      {/* 비트 — 톤을 교대로 줘서 인접 컷의 밝기 차를 만든다 (컷이 «읽히게») */}
      {spans.map(({ b, from, len }, i) => {
        // ★ 속도감 — 비트 안에서 «ask 가 말해지는 순간»에 한 번 더 컷한다.
        //   대표 지시(2026-08-11): "쇼츠는 속도감이 있어야 한다".
        //   컷 지점을 낭독 전환점과 «같은 프레임»에 두면 속도감과 싱크를 한 번에 얻는다.
        //   (임의 지점에 컷을 넣으면 말과 그림이 따로 논다)
        const sg = p.voice?.beats?.[i];
        const askAtF = sg?.saySec ? Math.round((sg.saySec + 0.18) * CANVAS.fps) : undefined;
        const toneA = i % 2 === 0 ? 1 : 1.6;
        const toneB = i % 2 === 0 ? 1.6 : 1;
        return (
        <Sequence key={i} from={from} durationInFrames={len}>
          <Backdrop spec={bgOf(b)} dur={len} data={data} tone={toneA} />
          {p.field?.length ? <TickerField tickers={p.field} seed={`${p.date}|${i}`} /> : null}
          <CutFlash />
          {/* ⛔ 비트 «안»의 중간컷 — 브리핑 계급 실측은 6.5~16.5컷/분인데
              이걸 켜면 30컷/분이 된다(우리 실측). slowCuts 면 끈다.
              근거: .agent/BRIEFING_BENCHMARK.md */}
          {!p.slowCuts && askAtF !== undefined && askAtF + 6 < len && (
            <Sequence from={askAtF} durationInFrames={len - askAtF}>
              <Backdrop spec={bgOf(b)} dur={len - askAtF} data={data} tone={toneB} />
              <CutFlash />
            </Sequence>
          )}
          <Say2 v={p.voice} seg={p.voice?.beats?.[i]} />
          <Head n={i + 1} eyebrow={b.eyebrow} head={b.head} />
          {b.visual && (
            <div style={{ position: 'absolute', left: PAD, right: PAD, top: VIS_TOP, height: VIS_H }}>
              <Vis v={b.visual} w={VIS_W} h={VIS_H} />
            </div>
          )}
          <Say text={b.say} ask={b.ask} askAt={askAtF} />
        </Sequence>
        );
      })}

      {/* CTA */}
      {/* CTA — ★ 고정 자산 클립을 «튼다». 영상마다 다시 조립하지 않는다.
          만드는 곳: src/remotion/kit/Outro.tsx → public/shorts/outro/outro.mp4
          바꾸려면 그 파일 하나만 고치고 다시 구우면 모든 영상에 반영된다. */}
      {!p.noOutro && (
      <Sequence from={ctaFrom} durationInFrames={ctaLen}>
        <AbsoluteFill style={{ background: '#05070C' }}>
          <OffthreadVideo muted src={staticFile('shorts/outro/outro.mp4')}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
        <Say2 v={p.voice} seg={p.voice?.outro} />
      </Sequence>
      )}

      {/* 루프백 — 첫 화면으로 이어진다 */}
      <Sequence from={loopFrom} durationInFrames={loopF}>
        <Backdrop spec={hookBg} dur={loopF} data={data} />
        <Say2 v={p.voice} seg={p.voice?.loop} />
        <div style={{ position: 'absolute', left: PAD, right: PAD, top: g.loopTop }}>
          <Rise><div style={{
            fontFamily, fontSize: 72, lineHeight: 1.14, fontWeight: 900, color: C.ink,
            letterSpacing: '-0.035em', whiteSpace: 'pre-line', textShadow: '0 6px 30px rgba(0,0,0,0.74)',
          }}>{p.loop}</div></Rise>
        </div>
        {/* ⛔ 2026-08-21 대표 확인: "끝에 이 장면이 왜 추가로 붙어있어?"
            여기 있던 LoopPhone 을 뺐다. 8/20 에 넣은 이유는 «아웃트로가 루프백에
            덮여 CTA 가 사라지던 것»을 막으려던 것이었는데, 지금은 아웃트로가
            «고정 클립»으로 온전히 재생되므로 그 이유가 사라졌다.
            폰+FREE 가 아웃트로에서 한 번, 루프에서 또 한 번 나와 «덧붙인 장면»으로 보였다.
            루프 구간의 일은 «마지막 문장을 0초의 훅으로 넘기는 것» 하나뿐이다. */}
        {/* ★ 2026-08-19 — 여기 있던 앱 배지(AppPlate)를 «뺐다».
            루프 구간의 일은 «마지막 문장을 0초의 훅 문장으로 넘기는 것» 하나뿐이다.
            앱스토어 배지 2개가 박혀 있으면 영상이 「끝난 것」으로 닫히고
            0초로 도는 순환이 끊긴다. 승자 3편의 지속률 100.6·111.4·134.3% 는
            전부 «루프가 돌아서» 나온 숫자다. CTA 는 바로 앞 outro 가 이미 한다. */}
      </Sequence>

      {/* [§1-2] 훅 구간에는 배너·테이프를 그리지 않는다 — 프레임0에서 «1초에 읽히는
          블록»은 심볼+훅 두 개뿐이어야 한다. 본문부터 등장한다. */}
      <Sequence from={hookF} durationInFrames={Math.max(1, ctaFrom - hookF)}>
        <BottomZone tape={p.tape} />
        <Banner title={p.title} date={p.date} />
      </Sequence>

      {/* ── 면책 — «노란 줄 하나», 화면 맨 아래 ──────────────────────────
          ★ 2026-08-19: 훅 구간에서는 «그리지 않는다» (Sequence from={hookF}).
          전에는 전역이라 «프레임 0 부터» 떠 있었고, 스크롤하는 시청자는
          첫 화면을 「규제 공지가 붙은 딱딱한 슬라이드」로 인식했다.
          배너·티커는 이미 훅에서 빼놓고 면책만 남겨둔 것은 일관성이 없었다.
          법적 고지는 본문 내내 + 설명란에 있으므로 고지 의무는 그대로 지켜진다. */}
      <Sequence from={hookF} durationInFrames={Math.max(1, ctaFrom - hookF)}>
        <div style={{
        // ★ 2026-08-17 세이프존 교정: bottom 22(y≈1868)는 유튜브 진행바 «아래»라
        //   사실상 표시가 안 됐다. 티커 바로 밑, UI 존(y>1536) 위로 올린다.
        position: 'absolute', left: PAD, right: PAD, bottom: g.discBottom,
        textAlign: 'center', pointerEvents: 'none',
      }}>
        {/* ⛔ 2026-08-21: 밝은 배경(실측 162~178) 위에서 주황 글자가 «사라졌다».
            면책은 법적 표시라 «항상» 읽혀야 한다 → 어두운 알약을 깐다. */}
        <span style={{
          display: 'inline-block', whiteSpace: 'nowrap',
          fontFamily, fontSize: 24, fontWeight: 800, letterSpacing: '0.01em',
          color: 'rgba(255,190,64,0.98)',
          background: 'rgba(6,9,16,0.72)', borderRadius: 999, padding: '7px 20px',
          textShadow: '0 2px 10px rgba(0,0,0,0.95)',
        }}>
          {p.disclaimer ?? 'Educational only. Not investment advice. Our read, not a forecast.'}
        </span>
      </div>
      </Sequence>
    </AbsoluteFill>
    </GeoCtx.Provider>
  );
};

function HookBlock({ line, sub, date, syms, bigNum, flip }: { line: string; sub: string; date: string; syms?: string[]; bigNum?: string; flip?: { down: string; up: string } }) {
  // [2026-08-07 조사반영] Shorts 는 커스텀 썸네일이 없다 — «프레임 0 이 썸네일»이다.
  // 훅 문장은 페이드 없이 프레임 0 부터 완전히 보인다. 배지·서브만 미세하게 뜬다.
  // [2026-08-10 §1-3] 심볼 히어로 — 문장보다 먼저 읽히는 «무엇인지»의 답.
  //   프레임 0 부터 불투명 (로고 페이드인 금지).
  const a = useIn(0, 5);
  const b = 1;
  return (
    <div>
      {syms && syms.length > 0 && (
        <div style={{ marginBottom: 26, display: 'flex', justifyContent: 'center' }}>
          <SymbolHero syms={syms} size={SYM.hero} />
        </div>
      )}
      {/* ★ 반전 블록 — 초록▼ 과 빨강▲ 가 «서로 반대»를 가리킨다.
          화살표는 폰트 글리프(▲▼)가 아니라 CSS 삼각형으로 그린다 —
          글리프가 없는 폰트면 두부(□)가 뜨는데, 그건 썸네일에서 치명적이다. */}
      {flip && (
        <div style={{ marginBottom: 20 }}>
          {([['down', flip.down, C.cool], ['up', flip.up, C.hot]] as const).map(([dir, label, bgc], i) => (
            <div key={dir} style={{
              display: 'flex', alignItems: 'center', gap: 20,
              background: bgc, color: '#070A11', borderRadius: 16,
              padding: '16px 28px', marginBottom: 14,
              transform: `rotate(${i ? 2.3 : -2.3}deg)`,
              boxShadow: '0 16px 48px rgba(0,0,0,0.74)',
            }}>
              <span style={{ fontFamily, fontSize: 76, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>{label}</span>
              <span style={{
                marginLeft: 'auto', width: 0, height: 0,
                borderLeft: '54px solid transparent', borderRight: '54px solid transparent',
                ...(dir === 'up' ? { borderBottom: '72px solid #070A11' } : { borderTop: '72px solid #070A11' }),
              }} />
            </div>
          ))}
        </div>
      )}
      {/* ★ 거대 숫자 — «단색 슬래브» 위에 검은 글자.
          대표 지시(2026-08-12): "너무 밋밋해. 그래픽적으로 자극적으로."
          근거: 158회 나온 썸네일은 흰+빨강 2색에 배경이 시끄러웠고, 그 뒤 만든 것들은
          전부 어두운 사진 + 흰 글자 단색이었다(조회 0~13). 이긴 쪽이 더 «시끄러웠다».
          떠 있는 글자는 폰 크기에서 배경에 묻힌다 — 색 블록은 안 묻힌다. */}
      {bigNum && (
        <div style={{
          display: 'inline-block', background: C.head, color: '#070A11',
          fontFamily, fontSize: 168, lineHeight: 0.98, fontWeight: 900,
          letterSpacing: '-0.05em', padding: '4px 26px 14px', borderRadius: 14,
          marginBottom: 16, boxShadow: '0 14px 50px rgba(0,0,0,0.72)',
          transform: 'rotate(-1.6deg)',
        }}>{bigNum}</div>
      )}
      <div style={{
        display: 'inline-block', opacity: a, marginBottom: 18,
        fontFamily, fontSize: 24, fontWeight: 900, color: '#0A0E16',
        background: C.head, borderRadius: 8, padding: '8px 16px', letterSpacing: '0.06em',
      }}>{date}</div>
      {/* ★ 훅 문장 — «줄마다 단색 슬래브». 마지막 줄은 강조색으로 2색 대비를 만든다.
          158회 썸네일이 흰+빨강 2색이었고, 단색으로 만든 것들은 전부 죽었다. */}
      {line.split('\n').map((ln, i, arr) => (
        <div key={i} style={{
          display: 'inline-block', opacity: b,
          // ⛔ 2026-08-21 대표 확인: "첫 화면에 제목이 눈에 들어오게 써있어야지"
          //   88 은 배경 캐릭터와 «경쟁»했다. 프레임0 은 1초 안에 읽혀야 한다.
          background: 'rgba(6,9,16,0.88)', borderRadius: 6,
          padding: '4px 18px 12px', marginBottom: 7,
          fontFamily, fontSize: syms && syms.length ? 86 : 102, lineHeight: 1.04, fontWeight: 900,
          color: i === arr.length - 1 && arr.length > 1 ? C.head : C.ink,
          letterSpacing: '-0.04em',
        }}>{ln}</div>
      ))}
      <div style={{
        marginTop: 10, display: 'inline-block', opacity: b,
        background: C.hot, color: '#0B0E14', borderRadius: 6, padding: '9px 18px 13px',
        fontFamily, fontSize: 46, fontWeight: 900, letterSpacing: '-0.02em',
      }}>{sub}</div>
    </div>
  );
}


/**
 * ★ 기관급 지표 띠 — 엔드카드 폰 «위»에 겹친다.
 *   음소거 시청자(모바일 영상의 80%)에게 «무엇이 공짜인지»를 글자로 보여준다.
 *   지표 이름만 쓴다 — 수치는 안 쓴다. 수치는 시시각각 변해서 광고에 박으면 «틀린 화면»이 된다.
 */
function MetricStrip({ items }: { items: string[] }) {
  const p = useIn(14, 12);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 268,
        display: 'flex', gap: 9, justifyContent: 'center',
        padding: '0 56px', opacity: p, transform: `translateY(${(1 - p) * 14}px)`,
      }}>
        {items.map((t) => (
          <span key={t} style={{
            fontFamily, fontSize: 34, fontWeight: 900, letterSpacing: '-0.01em',
            color: '#0A0E16', background: C.head, borderRadius: 999,
            padding: '10px 22px', boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          }}>{t}</span>
        ))}
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 214, textAlign: 'center',
        fontFamily, fontSize: 30, fontWeight: 900, letterSpacing: '0.10em',
        color: C.ink, opacity: p, textShadow: '0 4px 18px rgba(0,0,0,0.8)',
      }}>INSTITUTIONAL DATA · FREE</div>
    </AbsoluteFill>
  );
}

/**
 * CtaBlock — 「뒤에 앱 있음」 수준이던 CTA 를 «폰 목업»으로 교체 (2026-08-20 대표 지시)
 * ---------------------------------------------------------------------------
 * 왜 길이를 안 늘리는가: 시청자는 흥미를 잃는 «절대 시점»에 나간다. 뒤에 뭘 붙여도
 *   시청 «초»는 그대로인데 분모만 커져 평균 조회율이 깎인다(6.5초 붙이면 60%→45.6%).
 *   그래서 «같은 2.77초» 안에서 «질»만 올린다 — 길이 비용 0.
 *
 * 담는 것: 실제 앱 화면이 든 폰 · 뒤에 자매 앱 · 지표 이름 4개 · FREE
 *   지표 이름을 글자로 박는 이유 = 「맥스페인·감마플립·고래·다크풀」이 이 앱이 파는 것이고,
 *   말로 스쳐 지나가면 남지 않는다.
 */
// ── CTA 레이아웃 정본 (2026-08-20 재작업) ──────────────────────────────────
// ⛔ 이전 판이 깨진 이유 (렌더 프레임 실측):
//    · 폰 하단이 프레임 밖으로 잘렸다
//    · 칩 4개가 flexWrap 으로 두 줄이 되어 2개만 보였다
//    · ask 문구가 쇼츠 UI 존(y>1536) 으로 밀려 안 보였다
//    · 뒤 폰이 «한국어» 언더커런트였다 — 영어 채널 CTA 에 한글 화면이 뜬다
// ⇒ 좌표를 «전부 고정»하고 안전존(y<1500) 안에 넣는다. 자동 배치에 맡기지 않는다.
const CTA_PHONE_W = 290;
const CTA_APP_H = Math.round(CTA_PHONE_W * 2622 / 1206);
const CTA_STATUS = 28;
const CTA_PAD = 9;
const CTA_BOX_H = CTA_STATUS + CTA_APP_H + CTA_PAD * 2;
const CTA_TOP = 318;                                   // 폰 상단. 318 + 675 = 993 → 안전
const CTA_CHIPS_Y = 1058;
const CTA_ASK_Y = 1152;

function CtaPhone({ src, dx, scale, z, o, tilt = 0 }: {
  src: string; dx: number; scale: number; z: number; o: number; tilt?: number;
}) {
  const w = CTA_PHONE_W + CTA_PAD * 2;
  return (
    <div style={{
      position: 'absolute', left: `calc(50% + ${dx}px)`, top: 0, width: w, height: CTA_BOX_H,
      marginLeft: -w / 2, transform: `scale(${scale}) rotate(${tilt}deg)`,
      transformOrigin: '50% 50%', opacity: o, zIndex: z,
    }}>
      <div style={{
        position: 'absolute', left: -18, top: CTA_BOX_H - 18, width: w + 36, height: 60,
        borderRadius: '50%', background: 'rgba(2,4,9,0.62)', filter: 'blur(26px)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 42,
        background: 'linear-gradient(104deg,#E6ECF6 0%,#AAB7C9 22%,#68758A 52%,#9AA8BC 76%,#DCE4F0 100%)',
        boxShadow: '0 22px 54px rgba(0,0,0,0.62)',
      }} />
      <div style={{ position: 'absolute', inset: 5, borderRadius: 37, background: '#04050A' }} />
      <div style={{
        position: 'absolute', left: CTA_PAD, top: CTA_PAD,
        width: CTA_PHONE_W, height: CTA_STATUS + CTA_APP_H,
        borderRadius: 34, overflow: 'hidden', background: '#070A10',
      }}>
        <Img src={staticFile(src)} style={{
          position: 'absolute', left: 0, top: CTA_STATUS - 56, width: CTA_PHONE_W, display: 'block',
        }} />
        <div style={{
          position: 'absolute', left: '50%', top: 6, width: 58, height: 17,
          marginLeft: -29, borderRadius: 9, background: '#000',
        }} />
      </div>
    </div>
  );
}

const CTA_TERMS = ['MAX PAIN', 'GAMMA FLIP', 'WHALE FLOW', 'DARK POOL'];

function CtaBlock({ app, line, ask }: { app: string; line: string; ask: string }) {
  const f = useCurrentFrame();
  const a = useIn(2, 12);
  const rise = interpolate(f, [0, 16], [64, 0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const pop = useIn(6, 10);
  return (
    <AbsoluteFill>
      {/* 상단 — 앱 이름 + FREE. FREE 는 이 화면에서 «두 번째로 큰 글자»여야 한다 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 108, textAlign: 'center', opacity: a }}>
        <div style={{
          fontFamily, fontSize: 60, fontWeight: 900, color: C.head, letterSpacing: '-0.035em',
          textShadow: '0 4px 20px rgba(0,0,0,0.6)',
        }}>{app}</div>
        <div style={{
          marginTop: 14, display: 'inline-block', fontFamily, fontSize: 50, fontWeight: 900,
          color: '#0A0E16', background: C.head, borderRadius: 999, padding: '13px 44px',
          letterSpacing: '0.01em', boxShadow: '0 12px 36px rgba(0,0,0,0.55)',
          transform: `scale(${0.9 + pop * 0.1})`,
        }}>FREE &middot; iOS &amp; Android</div>
      </div>

      {/* 폰 2대 — 같은 앱의 다른 화면. 영어 채널이므로 «영어 화면»만 쓴다 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: CTA_TOP + rise, height: CTA_BOX_H }}>
        <CtaPhone src="ad/tall-guardian.png" dx={158} scale={0.86} z={1} o={a * 0.94} tilt={4} />
        <CtaPhone src="ad/tall-command-overview.png" dx={-52} scale={1} z={2} o={a} tilt={-2} />
      </div>

      {/* 지표 이름 — 이 앱이 «파는 것». 한 줄에 반드시 다 들어간다 (wrap 금지) */}
      <div style={{
        position: 'absolute', left: 24, right: 24, top: CTA_CHIPS_Y,
        display: 'flex', flexWrap: 'nowrap', gap: 10, justifyContent: 'center',
      }}>
        {CTA_TERMS.map((t, i) => {
          const q = interpolate(f, [14 + i * 3, 22 + i * 3], [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.6)) });
          return (
            <div key={t} style={{
              fontFamily, fontSize: 25, fontWeight: 900, letterSpacing: '0.02em', whiteSpace: 'nowrap',
              color: '#08101C', background: C.head, borderRadius: 8, padding: '8px 13px',
              opacity: q, transform: `scale(${0.82 + q * 0.18})`,
            }}>{t}</div>
          );
        })}
      </div>

      <div style={{
        position: 'absolute', left: 70, right: 70, top: CTA_ASK_Y, textAlign: 'center',
        opacity: useIn(18, 12), fontFamily, fontSize: 33, fontWeight: 800,
        color: C.ink, letterSpacing: '-0.01em', whiteSpace: 'pre-line', lineHeight: 1.24,
        textShadow: '0 3px 14px rgba(0,0,0,0.75)',
      }}>{ask}</div>
    </AbsoluteFill>
  );
}

/**
 * LoopPhone — 마지막 프레임까지 «폰 + FREE» 를 남긴다 (2026-08-20 대표 지시)
 * 스토어 배지는 넣지 않는다 — 배지가 있으면 「끝난 영상」으로 닫혀 루프가 끊긴다.
 */
function LoopPhone() {
  const a = useIn(0, 10);
  const w = CTA_PHONE_W * 0.96 + CTA_PAD * 2;
  const h = (CTA_STATUS + CTA_APP_H) * 0.96 + CTA_PAD * 2;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 560, height: h, opacity: a }}>
      <div style={{
        position: 'absolute', left: '50%', marginLeft: -w / 2, top: 0, width: w, height: h,
      }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 30,
          background: 'linear-gradient(104deg,#E6ECF6 0%,#AAB7C9 22%,#68758A 52%,#9AA8BC 76%,#DCE4F0 100%)',
          boxShadow: '0 20px 46px rgba(0,0,0,0.6)',
        }} />
        <div style={{ position: 'absolute', inset: 4, borderRadius: 26, background: '#04050A' }} />
        <div style={{ position: 'absolute', inset: 4, borderRadius: 26, overflow: 'hidden' }}>
          <Img src={staticFile('ad/tall-command-overview.png')} style={{
            position: 'absolute', left: 0, top: -34, width: w - 8, display: 'block',
          }} />
        </div>
        {/* FREE — 목업 «위에» 강하게 */}
        <div style={{
          position: 'absolute', right: -58, top: -38,
          transform: `rotate(-8deg) scale(${0.86 + useIn(4, 10) * 0.14})`,
          background: C.head, color: '#0A0E16', borderRadius: 14, padding: '13px 30px',
          fontFamily, fontSize: 56, fontWeight: 900, letterSpacing: '0.04em',
          boxShadow: '0 12px 34px rgba(0,0,0,0.6)', whiteSpace: 'nowrap',
        }}>FREE</div>
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: h + 22, textAlign: 'center',
        fontFamily, fontSize: 32, fontWeight: 900, color: C.head, letterSpacing: '0.06em',
        textShadow: '0 3px 14px rgba(0,0,0,0.8)', opacity: useIn(6, 10),
      }}>SIGNUM HQ &middot; iOS &amp; ANDROID</div>
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
