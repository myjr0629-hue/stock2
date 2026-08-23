/**
 * ThumbLF — 롱폼(16:9) 전용 썸네일
 * ---------------------------------------------------------------------------
 * ⛔ 왜 별도인가 (2026-08-24 · 대표 지시 「롱폼은 썸네일이 강력하게 해야한다」)
 *   쇼츠는 세로 커버를 «유튜브가 고른다» — 우리가 못 정한다 (yt-upload 주석 참조).
 *   그런데 롱폼은 반대다. thumbnails.set 이 실제로 먹고, 그 그림이 탐색·검색·추천에서
 *   시청자가 보는 «유일한 것» 이다. 프레임 0 을 그대로 쓰면 그 자리를 버리는 셈이다.
 *
 * ⛔ 설계 원칙 — 「작게 줄여도 읽히는가」 하나뿐이다
 *   유튜브 탐색 카드는 폭 약 360px, 모바일은 더 작다. 1920px 로 예쁜 것은 의미가 없다.
 *   그래서 «세 덩어리» 만 넣는다:
 *     ① 거대한 수 하나  — 축소해도 살아남는 것은 숫자다
 *     ② 짧은 반전 문장  — 두 줄, 각 줄 12자 이내
 *     ③ 대비 색 배지    — 「몇 개를 셌는가」
 *   ⛔ 얼굴·로고·장식 금지. 셋 말고는 아무것도 넣지 않는다.
 *
 * ⛔ 배경은 «실사» 를 쓴다. 우리 최고 성과작(일본 813회)이 실사였다.
 */

import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadJP } from '@remotion/google-fonts/NotoSansJP';

const { fontFamily } = loadFont();
const { fontFamily: fontJP } = loadJP();

export type ThumbLFProps = {
  /** 배경 스틸 (public 기준). 실사 프레임을 쓴다 */
  bg: string;
  /** ① 거대한 수 — 축소해도 읽히는 유일한 것 */
  big: string;
  /** 그 수가 «무엇의» 수인지 한 마디 */
  bigNote: string;
  /** ② 반전 문장 — 두 줄, 각 줄 짧게 */
  line1: string;
  line2: string;
  /** ③ 배지 — 표본 크기 */
  badge: string;
  jp?: boolean;
};

const C = {
  ink: '#F4F8FF',
  hot: '#FFC531',
  bad: '#FF5A6E',
  scrim: 'rgba(4,7,14,0.62)',
};

export const ThumbLF: React.FC<ThumbLFProps> = ({ bg, big, bigNote, line1, line2, badge, jp = false }) => {
  const FF = jp ? fontJP : fontFamily;
  return (
    <AbsoluteFill style={{ background: '#05070C' }}>
      <Img src={staticFile(bg)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {/* 스크림 — 배경이 예뻐도 «글자가 이겨야» 한다 */}
      <AbsoluteFill style={{ background: C.scrim }} />
      {/* 왼쪽 아래에서 위로 올라오는 어두운 그라디언트 — 문장 자리를 확보한다 */}
      <AbsoluteFill style={{
        background: 'linear-gradient(90deg, rgba(4,7,14,0.92) 0%, rgba(4,7,14,0.78) 46%, rgba(4,7,14,0.10) 100%)',
      }} />

      {/* ② 반전 문장 — 왼쪽 위 */}
      <div style={{
        position: 'absolute', left: 88, top: 118, width: 1080,
        fontFamily: FF, fontWeight: 900, fontSize: jp ? 96 : 104, lineHeight: 1.12,
        color: C.ink, letterSpacing: jp ? '-0.01em' : '-0.03em',
        textShadow: '0 8px 40px rgba(0,0,0,0.95)',
      }}>
        <div>{line1}</div>
        <div style={{ color: C.hot }}>{line2}</div>
      </div>

      {/* ① 거대한 수 — 오른쪽. 여기가 축소 생존의 핵심이다 */}
      <div style={{
        position: 'absolute', right: 84, top: 132, width: 640, textAlign: 'right',
      }}>
        <div style={{
          fontFamily, fontWeight: 900, fontSize: 300, lineHeight: 0.92,
          color: C.bad, letterSpacing: '-0.05em',
          textShadow: '0 10px 50px rgba(0,0,0,0.95)',
        }}>{big}</div>
        <div style={{
          marginTop: 10, fontFamily: FF, fontWeight: 800, fontSize: jp ? 40 : 42,
          color: 'rgba(244,248,255,0.86)', letterSpacing: jp ? 0 : '0.02em',
          textShadow: '0 4px 20px rgba(0,0,0,0.9)',
        }}>{bigNote}</div>
      </div>

      {/* ③ 배지 — 왼쪽 아래. 「몇 개를 셌는가」 */}
      <div style={{ position: 'absolute', left: 88, bottom: 96 }}>
        <div style={{
          display: 'inline-block', background: C.hot, color: '#0A0E16',
          borderRadius: 14, padding: '16px 30px',
          fontFamily: FF, fontWeight: 900, fontSize: jp ? 46 : 48, letterSpacing: jp ? 0 : '0.01em',
        }}>{badge}</div>
      </div>
    </AbsoluteFill>
  );
};

// ── 일본 롱폼 「四本の傘」 ───────────────────────────────────────────────────
// ⛔ 큰 수는 «15%» 로 잡는다. 영상의 결론이 그것이고, 축소해도 두 글자다.
//   「四本の傘」는 제목이 나르므로 썸네일에서 반복하지 않는다.
export const THUMBLF_JPLF: ThumbLFProps = {
  bg: 'shorts/bg/still/lf-jp-rate.jpg',
  big: '15%',
  bigNote: '通念が当たった割合',
  line1: '「金利が上がると',
  line2: '株は下がる」',
  badge: '4,924日を数えた',
  jp: true,
};
