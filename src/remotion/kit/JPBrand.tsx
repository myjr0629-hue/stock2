/**
 * JPBrand — 일본 채널(@signum_jp)의 로고 변형과 배너
 * ---------------------------------------------------------------------------
 * ⛔ 왜 코드로 그리는가
 *   브랜드 색·글자꼴이 기존 자산과 «정확히» 같아야 한다.
 *   손으로 얹으면 톤이 어긋나고, 다시 만들 때마다 달라진다.
 *   여기서 굽고 PNG 로 뽑아 쓴다 — 다시 필요하면 같은 결과가 나온다.
 *
 * ⛔ 왜 JP 배지를 다는가
 *   메인 채널(SIGNUM HQ)과 로고가 «완전히 같으면» 검색·추천에서 구분이 안 된다.
 *   일본 시청자가 영어 채널로 잘못 들어가면 바로 나간다.
 *   브랜드는 유지하되 한눈에 갈라져야 한다.
 *
 * 배너 규격 (유튜브)
 *   업로드 2560x1440. 다만 «전 기기에서 보이는 안전 영역»은 가운데 1546x423 뿐이다.
 *   ⇒ 읽혀야 하는 것은 전부 그 안에 넣는다. 밖은 배경으로만 쓴다.
 */

import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';

const { fontFamily } = loadFont();

const GOLD = '#FFB020';
const INK = '#F6FAFF';
const NAVY = '#0A1220';

/** 채널 아이콘 800x800 — 기존 로고 + 우하단 JP 배지 */
export const JPAvatar: React.FC = () => (
  <AbsoluteFill style={{ background: NAVY }}>
    <Img src={staticFile('app-icons/signum.png')}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
    {/* ⛔ 유튜브 채널 아바타는 «원형»으로 잘린다 (2026-08-21 확인).
        우하단 모서리(right/bottom 44)에 뒀더니 배지가 통째로 잘려나갔다.
        800x800 의 내접원은 중심(400,400)·반지름 400 — 그 안에 들어가야 살아남는다.
        ⇒ 아래 «가운데»로 옮긴다. 배지 모서리까지 계산해도 중심에서 354px, 안쪽이다. */}
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 118,
      display: 'flex', justifyContent: 'center',
    }}>
      <div style={{
        background: GOLD, color: '#08101C', borderRadius: 20,
        padding: '10px 30px 14px',
        fontFamily, fontSize: 110, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1,
        boxShadow: '0 14px 44px rgba(0,0,0,0.78)',
      }}>JP</div>
    </div>
  </AbsoluteFill>
);

/** 배너 2560x1440 — 안전영역 1546x423 안에만 글자를 둔다 */
export const JPBanner: React.FC = () => {
  const SAFE_W = 1546, SAFE_H = 423;
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      {/* ⛔ 밝기 실측 (2026-08-21). 처음 만든 배너는 YAVG 39.6 이었다 — 기준(90~150)의 절반도 안 된다.
          "습관적으로 어둡게 만든다"는 지적이 여기서도 그대로 재현됐다.
          아래 그라디언트를 실제로 들어올린다. 색상은 그대로 두고 «명도»만 올린다 —
          브랜드 금색(#FFB020)과 남색 계열은 유지해야 메인 채널과 한 형제로 읽힌다. */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse 95% 130% at 50% 48%, rgba(214,160,60,0.98) 0%, rgba(126,104,66,0.96) 34%, rgba(58,72,104,0.97) 68%, #2B3A55 100%)',
      }} />
      {/* 격자 — 터미널 느낌. 밝은 바탕에선 어두운 선이 보인다 */}
      <AbsoluteFill style={{
        backgroundImage:
          'linear-gradient(rgba(10,18,32,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(10,18,32,0.10) 1px, transparent 1px)',
        backgroundSize: '80px 80px',
      }} />
      {/* ⛔ 글자가 밝은 바탕에 묻히지 않도록 «안전영역 뒤»에만 어두운 판을 깐다.
          배경 전체를 어둡게 하면 다시 YAVG 가 무너진다 — 글자 뒤에만 국소로 넣는다. */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse 42% 30% at 50% 50%, rgba(8,14,26,0.62) 0%, rgba(8,14,26,0.28) 60%, rgba(8,14,26,0) 100%)',
      }} />

      {/* 안전영역 */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: SAFE_W, height: SAFE_H,
        marginLeft: -SAFE_W / 2, marginTop: -SAFE_H / 2,
        display: 'flex', alignItems: 'center', gap: 52,
      }}>
        <div style={{
          width: 300, height: 300, borderRadius: 66, overflow: 'hidden', flexShrink: 0,
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)', position: 'relative',
        }}>
          <Img src={staticFile('app-icons/signum.png')}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{
            position: 'absolute', right: 14, bottom: 14,
            background: GOLD, color: '#08101C', borderRadius: 10, padding: '5px 12px 7px',
            fontFamily, fontSize: 44, fontWeight: 900, lineHeight: 1,
          }}>JP</div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily, fontSize: 92, fontWeight: 900, color: INK, letterSpacing: '-0.035em',
            lineHeight: 1.05,
          }}>SIGNUM<span style={{ color: GOLD }}>｜</span>ウォール街の</div>
          <div style={{
            fontFamily, fontSize: 92, fontWeight: 900, color: GOLD, letterSpacing: '-0.035em',
            lineHeight: 1.05, marginTop: 4,
          }}>マックスペイン</div>
          <div style={{
            marginTop: 26, fontFamily, fontSize: 40, fontWeight: 800,
            color: 'rgba(220,232,248,0.9)', letterSpacing: '-0.01em',
          }}>ニュースの前に、数字を見ろ。</div>
          <div style={{
            marginTop: 16, display: 'flex', gap: 12,
          }}>
            {['マックスペイン', '機関投資家の手口', '板読み', '毎日更新'].map((t) => (
              <span key={t} style={{
                fontFamily, fontSize: 30, fontWeight: 900, color: '#08101C',
                background: GOLD, borderRadius: 8, padding: '8px 16px',
              }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
