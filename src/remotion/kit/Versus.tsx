/**
 * Versus — 「대결 + 함정 폭로」 포맷. 대표가 준 콘티 기조를 정본화한 것.
 * ---------------------------------------------------------------------------
 * 대표 지시 (2026-08-21):
 *   "이런식의 콘티가 더 자극적이고 사람들이 원하는 구조인것같은데"
 *   "이런 기조가 떠먹여주는 영상이라는것이야"
 *   "티커 로고같은것은 사용해도 되는것이야 더 과감하게 (…) 너무 얌전하게 영상을 만든다"
 *
 * ⛔ 기존 Briefing 과 무엇이 다른가
 *   Briefing : 차분한 데이터 카드. 훅도 «관찰»로 연다.
 *   Versus   : 화면 절반씩 두 종목을 «맞붙이고», 통념을 «틀렸다»고 때린 뒤
 *              그 이유를 옵션 북에서 꺼낸다. 로고를 크게 쓴다. 마지막은 첫 프레임으로 루프.
 *
 * ⛔ 세게 가되 «인과»는 단정하지 않는다.
 *   "기관이 함정을 팠다" 는 조작을 주장하는 문장이라 우리가 증명할 수 없다.
 *   대신 «위치»를 보여준다 — 맥스페인이 어디고 가격이 그 위 얼마인가.
 *   숫자는 전부 실측이라야 이 포맷이 산다.
 *
 * ⛔ 로고는 크게 쓴다. public/shorts/logos/*.png (46종 보유).
 *   금융 논평에서 티커 로고 사용은 표준 관행이다. 작게 숨길 이유가 없다.
 */

import React from 'react';
import {
  AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence,
  interpolate, useCurrentFrame, Easing, staticFile, spring, useVideoConfig,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';

const { fontFamily } = loadFont();
export const VERSUS_FPS = 30;
const F = (s: number) => Math.round(s * VERSUS_FPS);

const GOLD = '#FFB020';
const HOT = '#FF3B4E';
const UP = '#22E58B';
const INK = '#F6FAFF';

export type VersusBeat = {
  say: string;
  sub: string;
  sec: number;
  kind: 'split' | 'chart' | 'trap' | 'wall';
};

export type VersusProps = {
  a: { sym: string; pct: string; label: string };
  b: { sym: string; pct: string; label: string };
  headline: string;
  beats: VersusBeat[];
  levels: { price: string; maxPain: string; callWall: string; netPrem: string };
  source: string;
  voice?: { file: string; at: number; sec: number }[];
};

const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

/** 배경 — 어둡게 깔고 위에 전부 얹는다 */
const Bg: React.FC<{ src: string; dur: number; dim?: number }> = ({ src, dur, dim = 0.72 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#04060B' }}>
      <Loop durationInFrames={Math.max(dur + 2, 30)} layout="none">
        <OffthreadVideo muted src={staticFile(src)} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          transform: `scale(${1.06 + (f / Math.max(dur, 1)) * 0.06})`, transformOrigin: '50% 45%',
          filter: 'saturate(0.85) brightness(0.9)',
        }} />
      </Loop>
      <AbsoluteFill style={{ background: `rgba(4,6,11,${dim})` }} />
    </AbsoluteFill>
  );
};

/** ⛔ 로고는 크게. 이게 이 포맷의 핵심이다 */
const Logo: React.FC<{ sym: string; size: number; at: number }> = ({ sym, size, at }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 13, mass: 0.6 } });
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.24,
      background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
      transform: `scale(${0.6 + s * 0.4})`, opacity: Math.min(1, s * 1.6),
      boxShadow: '0 20px 60px rgba(0,0,0,0.72)', overflow: 'hidden',
    }}>
      <Img src={staticFile(`shorts/logos/${sym}.png`)}
        style={{ width: size * 0.76, height: size * 0.76, objectFit: 'contain' }} />
    </div>
  );
};

/** 큰 퍼센트 — 네온 */
const Pct: React.FC<{ v: string; up: boolean; at: number; size?: number }> = ({ v, up, at, size = 104 }) => {
  const a = ease(useCurrentFrame(), at, at + 8);
  const c = up ? UP : HOT;
  return (
    <div style={{
      fontFamily, fontSize: size, fontWeight: 900, letterSpacing: '-0.045em', color: c,
      opacity: a, transform: `translateY(${(1 - a) * 16}px)`,
      textShadow: `0 0 34px ${c}66, 0 6px 24px rgba(0,0,0,0.9)`,
    }}>{v}</div>
  );
};

/** 자막 — 두껍고 크게. 검은 외곽 + 그림자 */
const Cap: React.FC<{ t: string; at: number }> = ({ t, at }) => {
  const a = ease(useCurrentFrame(), at, at + 6);
  return (
    <div style={{
      position: 'absolute', left: 44, right: 44, bottom: 470, textAlign: 'center',
      opacity: a, transform: `translateY(${(1 - a) * 14}px)`,
    }}>
      <span style={{
        display: 'inline-block', fontFamily, fontSize: 60, fontWeight: 900, lineHeight: 1.14,
        letterSpacing: '-0.03em', color: INK, whiteSpace: 'pre-line',
        background: 'rgba(4,6,11,0.80)', borderRadius: 18, padding: '16px 26px',
        WebkitTextStroke: '2px rgba(0,0,0,0.85)',
        textShadow: '0 4px 22px rgba(0,0,0,0.95)',
      }}>{t}</span>
    </div>
  );
};

const Eyebrow: React.FC<{ t: string; at: number; tone?: string }> = ({ t, at, tone = GOLD }) => {
  const a = ease(useCurrentFrame(), at, at + 6);
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: 118, textAlign: 'center', opacity: a,
    }}>
      <span style={{
        fontFamily, fontSize: 30, fontWeight: 900, letterSpacing: '0.10em',
        color: '#08101C', background: tone, borderRadius: 8, padding: '9px 20px',
      }}>{t}</span>
    </div>
  );
};

/** 레벨 막대 — 가격이 맥스페인 위 어디에 앉아 있는지 «보여준다» */
const Ladder: React.FC<{ price: string; maxPain: string; callWall: string; at: number }> =
  ({ price, maxPain, callWall, at }) => {
    const f = useCurrentFrame();
    const a = ease(f, at, at + 12);
    const num = (s: string) => parseFloat(s.replace(/[^0-9.]/g, ''));
    const lo = num(maxPain), hi = num(callWall), px = num(price);
    const y = (v: number) => 560 - ((v - lo) / Math.max(hi - lo, 1)) * 420;
    const Row = (label: string, v: number, col: string, dash: boolean, i: number) => (
      <div key={label} style={{
        position: 'absolute', left: 0, right: 0, top: y(v),
        opacity: ease(f, at + 6 + i * 5, at + 16 + i * 5),
      }}>
        <div style={{ height: 0, borderTop: `4px ${dash ? 'dashed' : 'solid'} ${col}` }} />
        <div style={{
          position: 'absolute', right: 0, top: -44, fontFamily, fontSize: 34, fontWeight: 900,
          color: col, textShadow: '0 3px 14px rgba(0,0,0,0.9)',
        }}>{label}</div>
      </div>
    );
    return (
      <div style={{
        position: 'absolute', left: 96, right: 96, top: 430, height: 620, opacity: a,
      }}>
        {Row(`CALL WALL  ${callWall}`, hi, GOLD, true, 0)}
        {Row(`PRICE  ${price}`, px, INK, false, 1)}
        {Row(`MAX PAIN  ${maxPain}`, lo, HOT, true, 2)}
        <div style={{
          position: 'absolute', left: '50%', top: y(px), width: 6, height: y(lo) - y(px),
          marginLeft: -3, background: `linear-gradient(180deg, ${INK}00, ${HOT}cc)`,
          opacity: ease(f, at + 20, at + 34),
        }} />
      </div>
    );
  };

export const Versus: React.FC<VersusProps> = (p) => {
  let t = 0;
  const marks = p.beats.map((b) => { const at = t; t += b.sec; return { ...b, at }; });
  const total = t;

  return (
    <AbsoluteFill style={{ background: '#04060B' }}>
      {marks.map((b, i) => (
        <Sequence key={i} from={F(b.at)} durationInFrames={F(b.sec)}>
          {b.kind === 'split' && (
            <>
              <Bg src="shorts/bg/video/ani-surf-megacap.mp4" dur={F(b.sec)} dim={0.78} />
              <Eyebrow t={p.headline} at={2} />
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 300, display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 26,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <Logo sym={p.a.sym} size={230} at={3} />
                  <div style={{ fontFamily, fontSize: 40, fontWeight: 900, color: INK }}>{p.a.label}</div>
                  <Pct v={p.a.pct} up at={12} />
                </div>
                <div style={{
                  fontFamily, fontSize: 64, fontWeight: 900, color: GOLD, opacity: ease(useCurrentFrame(), 8, 16),
                }}>VS</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <Logo sym={p.b.sym} size={230} at={7} />
                  <div style={{ fontFamily, fontSize: 40, fontWeight: 900, color: INK }}>{p.b.label}</div>
                  <Pct v={p.b.pct} up={false} at={16} />
                </div>
              </div>
              <Cap t={b.sub} at={10} />
            </>
          )}

          {b.kind === 'chart' && (
            <>
              <Bg src="shorts/bg/video/fiber-one-lit.mp4" dur={F(b.sec)} dim={0.74} />
              <Eyebrow t="THE PART NOBODY SHOWS" at={2} />
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 380,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22,
              }}>
                <Logo sym={p.a.sym} size={200} at={3} />
                <Pct v={p.a.pct} up at={10} size={168} />
                <div style={{
                  fontFamily, fontSize: 36, fontWeight: 800, color: 'rgba(214,226,242,0.86)',
                  opacity: ease(useCurrentFrame(), 16, 26),
                }}>{p.b.label} {p.b.pct} &nbsp;&middot;&nbsp; same year</div>
              </div>
              <Cap t={b.sub} at={8} />
            </>
          )}

          {b.kind === 'trap' && (
            <>
              <Bg src="shorts/bg/video/steel-spheres.mp4" dur={F(b.sec)} dim={0.80} />
              <Eyebrow t="WHERE THE BOOK SITS" at={2} tone={HOT} />
              <Ladder price={p.levels.price} maxPain={p.levels.maxPain} callWall={p.levels.callWall} at={4} />
              <Cap t={b.sub} at={8} />
            </>
          )}

          {b.kind === 'wall' && (
            <>
              <Bg src="shorts/bg/video/gold-btc-race.mp4" dur={F(b.sec)} dim={0.82} />
              <Eyebrow t="NET OPTION PREMIUM" at={2} tone={HOT} />
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 470, textAlign: 'center',
              }}>
                <Pct v={p.levels.netPrem} up={false} at={4} size={150} />
                <div style={{
                  marginTop: 18, fontFamily, fontSize: 34, fontWeight: 800,
                  color: 'rgba(214,226,242,0.88)', opacity: ease(useCurrentFrame(), 12, 22),
                }}>money left while the price held</div>
              </div>
              <Cap t={b.sub} at={8} />
            </>
          )}

          {/* 출처 — 항상 화면에 */}
          <div style={{
            position: 'absolute', left: 40, right: 40, bottom: 330, textAlign: 'center',
            fontFamily, fontSize: 22, fontWeight: 800, color: 'rgba(255,176,32,0.92)',
          }}>{p.source}</div>
          <div style={{
            position: 'absolute', left: 40, right: 40, bottom: 282, textAlign: 'center',
            fontFamily, fontSize: 21, fontWeight: 800, color: 'rgba(226,236,250,0.72)',
          }}>Educational only &middot; Not investment advice</div>
        </Sequence>
      ))}

      {/* 루프 — 마지막 0.9초에 첫 프레임으로 스냅. 되감기가 자연스러워진다 */}
      <Sequence from={F(total - 0.9)} durationInFrames={F(0.9)}>
        <AbsoluteFill style={{ background: '#04060B' }}>
          <Bg src="shorts/bg/video/ani-surf-megacap.mp4" dur={F(0.9)} dim={0.78} />
          <Eyebrow t={p.headline} at={0} />
          <div style={{
            position: 'absolute', left: 0, right: 0, top: 300, display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: 26,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <Logo sym={p.a.sym} size={230} at={0} />
              <div style={{ fontFamily, fontSize: 40, fontWeight: 900, color: INK }}>{p.a.label}</div>
              <Pct v={p.a.pct} up at={0} />
            </div>
            <div style={{ fontFamily, fontSize: 64, fontWeight: 900, color: GOLD }}>VS</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <Logo sym={p.b.sym} size={230} at={0} />
              <div style={{ fontFamily, fontSize: 40, fontWeight: 900, color: INK }}>{p.b.label}</div>
              <Pct v={p.b.pct} up={false} at={0} />
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {(p.voice ?? []).map((v) => (
        <Sequence key={v.file} from={F(v.at)} durationInFrames={F(v.sec) + 4}>
          <Audio src={staticFile(v.file)} volume={1} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const versusFrames = (p: VersusProps) =>
  F(p.beats.reduce((a, b) => a + b.sec, 0));
