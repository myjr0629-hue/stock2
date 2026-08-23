/**
 * Stat — 「고정 제목 + 움직이는 실사 + 통계 라벨」. 폭발률 7.1% 군집을 픽셀로 재서 복제한 것.
 * ---------------------------------------------------------------------------
 * ⛔ 왜 Race 를 두고 이걸 또 만드나 (2026-08-23)
 *   제목 임베딩 군집(24,638편·239채널)으로 갈랐더니 Race 가 속한 군집이 «폭발률 2.7%» 였다.
 *   전체 평균이 5.1% 다. 즉 우리가 복제한 것은 «평균 이하» 계열이었고,
 *   Jeremy 의 166만회는 그 군집의 «예외» 였지 유형의 힘이 아니었다.
 *
 *   폭발률 7.1% 군집(1,206편·144채널·1위채널비중 10%)을 3편 내려받아 재니 규격이 같았다:
 *     R1 「Me after becoming a Billionaire」 4,610만  상단정지 100% · 컷 1 · 중앙활동 205
 *     R2 「THE RICHEST MEN IN THE WORLD ARE」 485만   상단정지 100% · 컷 1 · 중앙활동 157
 *     R4 「THE POWER OF BOOKS」 318만                상단정지  87% · 컷 0 · 중앙활동 178
 *
 *   ⛔ 우리 Race 는 중앙활동 40 이었다. 뼈대(상단 고정)는 같은데 «가운데가 죽어 있었다».
 *     막대가 정적 배경 위에서 자라기만 해서다. 클립이 없어서가 아니다 —
 *     우리 라이브러리 176개 중 36개가 이미 150+ 를 낸다 (steel-balls 193 · ani-juggle 182).
 *
 * ── 복제한 규격 (3편 공통) ──────────────────────────────────────────────
 *   ① 상단 고정 제목 — 대문자, «핵심어 하나만» 노란색. 영상 내내 1픽셀도 안 바뀐다
 *   ② 중앙 — 움직이는 영상이 화면을 꽉 채운다. 구간마다 바뀌되 «하드컷이 아니라 디졸브»
 *      (R2 는 장면이 4개인데 컷 검출은 1개였다 — 부드럽게 넘긴다는 뜻이다)
 *   ③ 하단 라벨 — 2~4단어. R2 는 「75% ENTREPRENEURS」「7% ATHLETES」「0% EMPLOYEES」
 *   ④ 마지막 — 결론 한 줄 + 행동 유도 (R2: 「DOUBLE TAP IF AGREE」)
 *
 * ⛔ 숫자는 전부 실측이다. 이 계열은 «통계» 가 알맹이라 지어내면 즉시 죽는다.
 */

import React from 'react';
import {
  AbsoluteFill, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig,
  staticFile, Easing, Audio,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadJP } from '@remotion/google-fonts/NotoSansJP';

const { fontFamily } = loadFont();
const { fontFamily: fontJP } = loadJP();

export const STAT_FPS = 30;

export type StatBeat = {
  /** 이 구간에 깔 클립 (public/shorts/bg/video/<clip>.mp4) */
  clip: string;
  /** 하단 라벨 — 강조할 숫자 */
  value: string;
  /** 하단 라벨 — 그 뒤의 말. 합쳐서 2~4단어여야 한다 */
  label: string;
  sec: number;
  /** ⛔ 클립의 «몇 초 지점» 부터 쓸지. 앞 4초만 쓰면 뜻이 뒤집힐 수 있다 —
   *   ax-stack-blocks 는 처음엔 블록이 낮고 나중에 높이 쌓인다.
   *   가장 큰 숫자에 «낮은 더미» 가 붙어 서열이 거꾸로 읽혔다 (2026-08-23). */
  from?: number;
};

export type StatProps = {
  /** 상단 고정 제목. «핵심어 하나만» 색이 바뀐다 */
  title: { pre: string; hot: string; post: string };
  beats: StatBeat[];
  /** 마지막 결론 한 줄 */
  verdict: string;
  /** 행동 유도 (R2 의 「DOUBLE TAP IF AGREE」 자리) */
  cta?: string;
  /** 출처 한 줄 — 통계가 알맹이인 계열이라 반드시 밝힌다 */
  source: string;
  jp?: boolean;
  music?: string;
};

export const statDuration = (p: StatProps) =>
  Math.round((p.beats.reduce((s, b) => s + b.sec, 0) + 3.0) * STAT_FPS);

export const Stat: React.FC<StatProps> = ({ title, beats, verdict, cta, source, jp = false, music }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const t = frame / STAT_FPS;
  const FF = jp ? fontJP : fontFamily;

  const VERDICT_SEC = 3.0;
  const bodyEnd = beats.reduce((s, b) => s + b.sec, 0);

  // 지금 몇 번째 구간인가
  let acc = 0, idx = 0, local = 0;
  for (let i = 0; i < beats.length; i++) {
    if (t < acc + beats[i].sec) { idx = i; local = t - acc; break; }
    acc += beats[i].sec;
    idx = i; local = beats[i].sec;
  }
  const inVerdict = t >= bodyEnd;

  const TOP_H = 250;
  const PAD = 52;

  // ⛔ 영상은 «화면 전체» 가 아니라 «세로 가운데 띠» 다 (2026-08-23 실측).
  //   첫 렌더에서 화면 전체에 깔고 그라디언트만 얹었더니 상단 정지율이 4% 였다.
  //   레퍼런스는 87~100% 다 — 위아래를 «진짜 검은색» 으로 막기 때문이다.
  //     R1 영상영역 29~74% · R2 29~71% · R4 24~75%  (위 검은띠 24~29% · 아래 25~29%)
  //   그래서 여기도 같은 비율로 자른다. 이게 이 계열의 뼈대다.
  const VID_TOP = Math.round(H * 0.27);
  const VID_H = Math.round(H * 0.46);

  // ⛔ 구간 전환은 «디졸브» 다. 하드컷을 쓰면 컷 수가 늘어나는데,
  //   레퍼런스 3편의 컷 수는 0~1 이었다. 부드럽게 겹쳐 넘긴다.
  // ⛔ 0.5초 디졸브는 «컷» 으로 검출됐다 (4개 · 레퍼런스 0~1). 더 길게 겹친다.
  const XF = 1.1;
  const clipOpacity = (i: number) => {
    if (i === idx) {
      const inN = interpolate(local, [0, XF], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return i === 0 ? 1 : inN;
    }
    if (i === idx - 1) {
      return interpolate(local, [0, XF], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    }
    return 0;
  };

  return (
    <AbsoluteFill style={{ background: '#000', fontFamily: FF }}>
      {/* ══ 중앙 — 움직이는 영상이 화면을 꽉 채운다 ══
          레퍼런스의 중앙활동은 157~205 였다. 여기가 죽으면 이 계열이 성립하지 않는다. */}
      {beats.map((b, i) => {
        const op = clipOpacity(i);
        if (op <= 0.001) return null;
        return (
          <div key={i} style={{
            position: 'absolute', left: 0, top: VID_TOP, width: W, height: VID_H,
            opacity: op, overflow: 'hidden',
          }}>
            <OffthreadVideo
              src={staticFile(`shorts/bg/video/${b.clip}.mp4`)}
              muted
              startFrom={Math.round((b.from ?? 0) * STAT_FPS)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        );
      })}

      {/* ══ 상단 고정 제목 ══
          ⛔ frame 을 참조하지 않는다. 첫 프레임부터 끝까지 동일하다.
             레퍼런스 3편이 87~100% 정지였고 그게 이 뼈대의 핵심이다. */}
      <div style={{
        position: 'absolute', left: PAD, top: 0, width: W - PAD * 2, height: TOP_H,
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          fontWeight: 900, fontSize: jp ? 54 : 60, lineHeight: 1.14,
          letterSpacing: jp ? 0 : 1, color: '#FFFFFF',
          textShadow: '0 4px 26px rgba(0,0,0,.95)',
        }}>
          {title.pre}
          <span style={{ color: '#FFC531' }}>{title.hot}</span>
          {title.post}
        </div>
      </div>

      {/* 핸들 — Life in Focus 선례대로 작고 흐리게 */}
      <div style={{
        position: 'absolute', left: PAD, top: TOP_H - 34, width: W - PAD * 2,
        fontWeight: 700, fontSize: 20, letterSpacing: 2.4, color: 'rgba(255,255,255,.30)',
      }}>@SIGNUMHQ</div>

      {/* ══ 하단 라벨 — 구간마다 바뀐다. 2~4단어 ══ */}
      {!inVerdict && (
        <div style={{
          position: 'absolute', left: PAD, top: VID_TOP + VID_H + 40, width: W - PAD * 2,
          opacity: interpolate(local, [0, 0.35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}>
          <div style={{
            display: 'inline-block', background: 'rgba(0,0,0,.72)',
            padding: '14px 26px', borderRadius: 10,
            fontWeight: 900, fontSize: jp ? 62 : 70, letterSpacing: 0,
            color: '#FFFFFF', textShadow: '0 3px 16px rgba(0,0,0,.9)',
          }}>
            <span style={{ color: '#FFC531' }}>{beats[idx].value}</span>
            <span style={{ fontSize: jp ? 44 : 48, marginLeft: 16 }}>{beats[idx].label}</span>
          </div>
        </div>
      )}

      {/* ══ 마지막 — 결론 + 행동 유도 ══
          R2 는 여기서 「NOBODY GOT RICH WITH A SALARY / DOUBLE TAP IF AGREE」 를 띄웠다.
          우리 좋아요율이 0.18% 다 — 이 자리가 그걸 치는 유일한 지점이다. */}
      {inVerdict && (
        <div style={{
          position: 'absolute', left: PAD, top: VID_TOP + VID_H + 30, width: W - PAD * 2,
          opacity: interpolate(t - bodyEnd, [0, 0.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}>
          <div style={{
            background: 'rgba(0,0,0,.78)', padding: '22px 28px', borderRadius: 12,
            fontWeight: 900, fontSize: jp ? 56 : 60, lineHeight: 1.2, color: '#FFFFFF',
          }}>{verdict}</div>
          {cta ? (
            <div style={{
              marginTop: 18, fontWeight: 900, fontSize: jp ? 40 : 44,
              letterSpacing: 1, color: '#FFC531', textShadow: '0 3px 16px rgba(0,0,0,.9)',
            }}>{cta}</div>
          ) : null}
        </div>
      )}

      {/* 출처 — 통계가 알맹이인 계열이라 반드시 밝힌다 */}
      <div style={{
        position: 'absolute', left: PAD, top: H - 84, width: W - PAD * 2,
        fontWeight: 700, fontSize: 26, color: 'rgba(255,255,255,.52)',
      }}>{source}</div>

      {music ? <Audio src={staticFile(music)} volume={0.8} /> : null}
    </AbsoluteFill>
  );
};
