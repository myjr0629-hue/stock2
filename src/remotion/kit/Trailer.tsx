/**
 * Trailer — 채널 트레일러. 「왜 구독해야 하는가」에 답한다.
 * ---------------------------------------------------------------------------
 * ⛔ 왜 만드는가 (2026-08-21 실측)
 *   7/1~8/21  조회 1,458 · 구독 증가 1 · 좋아요 1 · 공유 1.
 *   24편을 올려 구독자 2명이다. 보긴 보는데 «남지 않는다».
 *   채널에 재생목록 0 · 섹션 0 · 트레일러 없음 —
 *   쇼츠에서 넘어온 사람에게 «이 채널이 무엇이고 왜 남아야 하는지»를 말한 적이 없다.
 *
 * ⛔ 말투는 세게 간다 (홍보다). 다만 «숫자»는 전부 우리가 실제로 낸 것이다.
 *   시청자가 확인했을 때 없는 숫자면 이 채널의 유일한 무기가 무너진다.
 *   · GLD↔비트코인 42일 상관 0.62 · 1년 중앙 0.26   (ke34mBPAfNQ)
 *   · 한 세션 거래량의 54% 가 거래소 밖              (6tPJa20fjeE)
 *   · AMD +117% · Nvidia +16%, 같은 해               (Itfjyh55NCY)
 *
 * ⛔ 약속은 지킬 수 있는 것만. 8/11~8/21 에 25편 — 거래일마다 2편 이상 냈다.
 * ⛔ 트레일러는 쇼츠가 아니다. 30초 상한을 적용하지 않는다 (채널 페이지에서 재생된다).
 *
 * 타이밍은 «낭독 실측»(.agent/_tts_trailer.json)에서 왔다. 눈대중이 아니다.
 */

import React from 'react';
import {
  AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence,
  interpolate, useCurrentFrame, Easing, staticFile,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';

const { fontFamily } = loadFont();

export const TRAILER_FPS = 30;
const F = (s: number) => Math.round(s * TRAILER_FPS);

/** 낭독 실측 (초) — scripts/tts-lines.mjs 출력 */
const VO = [
  { f: 'shorts/audio/trailer/00.mp3', at: 0.30, sec: 2.93 },
  { f: 'shorts/audio/trailer/01.mp3', at: 3.60, sec: 4.60 },
  { f: 'shorts/audio/trailer/02.mp3', at: 8.90, sec: 6.04 },
  { f: 'shorts/audio/trailer/03.mp3', at: 15.40, sec: 3.30 },
  { f: 'shorts/audio/trailer/04.mp3', at: 19.20, sec: 4.32 },
  { f: 'shorts/audio/trailer/05.mp3', at: 24.00, sec: 2.18 },
  { f: 'shorts/audio/trailer/06.mp3', at: 26.80, sec: 2.69 },
  { f: 'shorts/audio/trailer/07.mp3', at: 30.20, sec: 2.28 },
];
export const TRAILER_FRAMES = F(33.2);

const GOLD = '#FFB020';
const INK = '#F4F8FE';
const PANEL = 'rgba(9,13,22,0.84)';

const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

/** 배경 — declip.mjs 를 거친 1080x1920 클립만 쓴다 (워터마크 제거됨) */
const Bg: React.FC<{ src: string; dur: number; startFrom?: number }> = ({ src, dur, startFrom }) => {
  const f = useCurrentFrame();
  const z = 1.05 + (f / Math.max(dur, 1)) * 0.07;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#05070C' }}>
      <Loop durationInFrames={Math.max(dur + 2, 30)} layout="none">
        <OffthreadVideo muted startFrom={startFrom} src={staticFile(src)} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          transform: `scale(${z})`, transformOrigin: '50% 42%', filter: 'saturate(0.93) brightness(1.03)',
        }} />
      </Loop>
      <AbsoluteFill style={{
        background: 'linear-gradient(180deg, rgba(3,5,10,0.70) 0%, rgba(3,5,10,0.14) 32%, rgba(3,5,10,0.28) 60%, rgba(3,5,10,0.88) 100%)',
      }} />
    </AbsoluteFill>
  );
};

const Line: React.FC<{ at: number; top: number; text: string; size?: number; color?: string }> =
  ({ at, top, text, size = 78, color = INK }) => {
    const a = ease(useCurrentFrame(), at, at + 9);
    return (
      <div style={{
        position: 'absolute', left: 56, right: 56, top,
        opacity: a, transform: `translateY(${(1 - a) * 22}px)`,
        fontFamily, fontSize: size, fontWeight: 900, lineHeight: 1.1,
        letterSpacing: '-0.035em', color, whiteSpace: 'pre-line',
        textShadow: '0 6px 30px rgba(0,0,0,0.88)',
      }}>{text}</div>
    );
  };

/** 실측 카드 — 값은 우리가 낸 것만 */
const Proof: React.FC<{ at: number; top: number; k: string; v: string; note: string; up?: boolean }> =
  ({ at, top, k, v, note, up = true }) => {
    const a = ease(useCurrentFrame(), at, at + 10);
    return (
      <div style={{
        position: 'absolute', left: 52, right: 52, top,
        opacity: a, transform: `translateX(${(1 - a) * -28}px)`,
        background: PANEL, border: '1px solid rgba(255,255,255,0.11)', borderRadius: 22,
        padding: '22px 28px', display: 'flex', alignItems: 'center', gap: 20,
        boxShadow: '0 18px 48px rgba(0,0,0,0.55)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily, fontSize: 32, fontWeight: 900, color: INK, letterSpacing: '-0.015em' }}>{k}</div>
          <div style={{ fontFamily, fontSize: 22, fontWeight: 700, color: 'rgba(214,226,242,0.74)', marginTop: 5 }}>{note}</div>
        </div>
        <div style={{
          fontFamily, fontSize: 58, fontWeight: 900, letterSpacing: '-0.035em',
          color: up ? '#3DDC97' : '#FF5A6E',
        }}>{v}</div>
      </div>
    );
  };

const P_W = 372;
const P_APP = Math.round(P_W * 2622 / 1206);
const P_ST = 32, P_PAD = 10;
const Phone: React.FC<{ src: string; dx: number; tilt: number; z: number; at: number; shift: number }> =
  ({ src, dx, tilt, z, at, shift }) => {
    const a = ease(useCurrentFrame(), at, at + 14);
    const w = P_W + P_PAD * 2;
    return (
      <div style={{
        position: 'absolute', left: `calc(50% + ${dx}px)`, top: 0,
        width: w, height: P_ST + P_APP + P_PAD * 2, marginLeft: -w / 2,
        transform: `rotate(${tilt}deg) translateY(${(1 - a) * 44}px)`, opacity: a, zIndex: z,
      }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 52,
          background: 'linear-gradient(104deg,#E6ECF6 0%,#AAB7C9 22%,#68758A 52%,#9AA8BC 76%,#DCE4F0 100%)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        }} />
        <div style={{ position: 'absolute', inset: 6, borderRadius: 46, background: '#04050A' }} />
        <div style={{
          position: 'absolute', left: P_PAD, top: P_PAD, width: P_W, height: P_ST + P_APP,
          borderRadius: 42, overflow: 'hidden', background: '#070A10',
        }}>
          <Img src={staticFile(src)} style={{ position: 'absolute', left: 0, top: P_ST - shift, width: P_W, display: 'block' }} />
        </div>
      </div>
    );
  };

const Chip: React.FC<{ at: number; t: string; i: number }> = ({ at, t, i }) => {
  const a = interpolate(useCurrentFrame(), [at + i * 5, at + 13 + i * 5], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.5)) });
  return (
    <div style={{
      fontFamily, fontSize: 33, fontWeight: 900, letterSpacing: '-0.01em',
      color: '#08101C', background: GOLD, borderRadius: 12, padding: '13px 21px',
      opacity: a, transform: `scale(${0.86 + a * 0.14})`, whiteSpace: 'nowrap',
    }}>{t}</div>
  );
};

export const Trailer: React.FC = () => (
  <AbsoluteFill style={{ background: '#05070C' }}>

    {/* 0.0~8.9  훅 */}
    <Sequence from={0} durationInFrames={F(8.9)}>
      <Bg src="shorts/bg/video/gold-btc-race.mp4" dur={F(8.9)} />
      <Line at={4} top={286} text={'Everyone reports\nthe headline.'} size={80} />
      <Line at={F(2.4)} top={606} text={'We run\nthe numbers.'} size={106} color={GOLD} />
      <div style={{
        position: 'absolute', left: 56, right: 56, top: 940,
        opacity: ease(useCurrentFrame(), F(3.8), F(4.5)),
        fontFamily, fontSize: 32, fontWeight: 800, color: 'rgba(216,228,244,0.90)', lineHeight: 1.34,
        textShadow: '0 3px 16px rgba(0,0,0,0.92)',
      }}>Raw daily closes. The options book. Our own math, on screen while you watch.</div>
    </Sequence>

    {/* 8.9~26.8  증거 세 가지 */}
    <Sequence from={F(8.9)} durationInFrames={F(17.9)}>
      <Bg src="shorts/bg/video/fiber-one-lit.mp4" dur={F(17.9)} />
      <Line at={4} top={222} text={'Numbers you will not\nfind in a headline'} size={64} color={GOLD} />
      <Proof at={F(0.6)} top={456} k="Gold vs bitcoin" v="0.62"
        note="42-day correlation · one-year median 0.26" />
      <Proof at={F(6.5)} top={700} k="Volume off-exchange" v="54%"
        note="dark pool share, one session" up={false} />
      <Proof at={F(10.3)} top={944} k="AMD vs Nvidia" v="+117%"
        note="same year · Nvidia +16%" />
      <Line at={F(15.1)} top={1218} text={'We computed all three.\nCheck them yourself.'} size={50} />
    </Sequence>

    {/* 26.8~30.2  시리즈 */}
    <Sequence from={F(26.8)} durationInFrames={F(3.4)}>
      <Bg src="shorts/bg/video/ani-bull-bear.mp4" dur={F(3.4)} />
      <Line at={2} top={252} text={'Four series.\nEvery trading day.'} size={72} color={GOLD} />
      <div style={{
        position: 'absolute', left: 40, right: 40, top: 520,
        display: 'flex', flexWrap: 'wrap', gap: 13, justifyContent: 'center',
      }}>
        {['WHY THE MARKET MOVED', 'CHIP WATCH', 'MACRO DECODED', 'OPTIONS AND FLOW']
          .map((t, i) => <Chip key={t} at={F(0.4)} t={t} i={i} />)}
      </div>
      <Line at={F(1.9)} top={880} text={'Under thirty seconds each.'} size={56} />
      <Line at={F(2.5)} top={1000} text={'No filler. One finding.'} size={56} color={GOLD} />
    </Sequence>

    {/* 30.2~33.2  앱 + 구독 */}
    <Sequence from={F(30.2)} durationInFrames={F(3.0)}>
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse 120% 82% at 50% 44%, rgba(90,64,19,0.96) 0%, rgba(26,20,9,0.97) 54%, #05070C 100%)',
      }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 124, textAlign: 'center',
        opacity: ease(useCurrentFrame(), 0, 11),
      }}>
        <div style={{ fontFamily, fontSize: 68, fontWeight: 900, color: GOLD, letterSpacing: '-0.035em' }}>SIGNUM HQ</div>
        <div style={{
          marginTop: 14, display: 'inline-block', fontFamily, fontSize: 54, fontWeight: 900,
          color: '#0A0E16', background: GOLD, borderRadius: 999, padding: '14px 46px',
          boxShadow: '0 14px 42px rgba(0,0,0,0.62)',
        }}>FREE &middot; iOS &amp; Android</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 392, height: 880 }}>
        <Phone src="ad/tall-guardian.png" dx={196} tilt={5} z={1} at={6} shift={116} />
        <Phone src="ad/tall-command-overview.png" dx={-66} tilt={-3} z={2} at={0} shift={52} />
      </div>
      <Line at={F(0.9)} top={1352} text={'Hit subscribe.\nThe next one finds you.'} size={56} />
      <div style={{
        position: 'absolute', left: 40, right: 40, top: 1566, textAlign: 'center',
        opacity: ease(useCurrentFrame(), F(1.6), F(2.1)),
        fontFamily, fontSize: 34, fontWeight: 800, color: INK,
      }}>signumhq.com/app</div>
      <div style={{
        position: 'absolute', left: 40, right: 40, bottom: 232, textAlign: 'center',
        fontFamily, fontSize: 23, fontWeight: 800, color: 'rgba(255,176,32,0.92)',
      }}>Educational only &middot; Not investment advice</div>
    </Sequence>

    {/* 낭독 — 실측 길이 그대로 배치 */}
    {VO.map((v) => (
      <Sequence key={v.f} from={F(v.at)} durationInFrames={F(v.sec) + 4}>
        <Audio src={staticFile(v.f)} volume={1} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
