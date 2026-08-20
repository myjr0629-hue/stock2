/**
 * Outro — 「뒤에 붙이는 끝 장면」 정본. **한 번 만들어 모든 영상이 재사용한다.**
 * ---------------------------------------------------------------------------
 * 대표 지시 (2026-08-20):
 *   "그냥 마지막 장면을 고정해놔 (…) 모닝이나 클로즈에 사용하면 되자나
 *    뒤에 붙일때 왜 이렇게 복잡하게 하냐 (…) 뒤에 붙이는 장면을 그냥 만들어서 사용하라고했는데"
 *
 * ⇒ 브리핑마다 CTA 를 다시 조립하지 않는다. 이 컴포지션을 **한 번 렌더해서**
 *   `public/shorts/outro/outro.mp4` 로 굽고, 브리핑·개념편이 그 «영상»을 튼다.
 *   외부 영상에도 ffmpeg concat 으로 그대로 붙일 수 있다.
 *
 * ⛔ 이전 판이 지적받은 것: "공간은 많은데 너무 작자나"
 *   폰 폭 290 → **400**. 화면을 채운다.
 *
 * ⛔ 모든 등장 애니메이션은 **2초(60프레임) 안에 끝난다.**
 *   브리핑 CTA 길이가 낭독에 따라 2.8~3.5초로 변하므로, 앞에서 잘려도 완성돼 보여야 한다.
 */

import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, Easing, staticFile } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';

const { fontFamily } = loadFont();
export const OUTRO_FPS = 30;
export const OUTRO_FRAMES = 120;                    // 4.0초 — 넉넉히 굽고 필요한 만큼만 쓴다
const W = 1080, H = 1920;
const GOLD = '#FFB020';

const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

// ── 폰 — 크게. 프레임의 37% 폭 ─────────────────────────────────────────────
const P_W = 400;
const P_APP = Math.round(P_W * 2622 / 1206);
const P_ST = 34, P_PAD = 11;
const P_BOX = P_ST + P_APP + P_PAD * 2;
const TOP = 352;

const Phone: React.FC<{ src: string; dx: number; scale: number; z: number; o: number; tilt: number; shift: number }> =
  ({ src, dx, scale, z, o, tilt, shift }) => {
    const w = P_W + P_PAD * 2;
    return (
      <div style={{
        position: 'absolute', left: `calc(50% + ${dx}px)`, top: 0, width: w, height: P_BOX,
        marginLeft: -w / 2, transform: `scale(${scale}) rotate(${tilt}deg)`,
        transformOrigin: '50% 50%', opacity: o, zIndex: z,
      }}>
        <div style={{
          position: 'absolute', left: -24, top: P_BOX - 22, width: w + 48, height: 76,
          borderRadius: '50%', background: 'rgba(2,4,9,0.66)', filter: 'blur(30px)',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 56,
          background: 'linear-gradient(104deg,#E6ECF6 0%,#AAB7C9 22%,#68758A 52%,#9AA8BC 76%,#DCE4F0 100%)',
          boxShadow: '0 26px 64px rgba(0,0,0,0.66)',
        }} />
        <div style={{ position: 'absolute', inset: 6, borderRadius: 50, background: '#04050A' }} />
        <div style={{
          position: 'absolute', left: P_PAD, top: P_PAD, width: P_W, height: P_ST + P_APP,
          borderRadius: 46, overflow: 'hidden', background: '#070A10',
        }}>
          <Img src={staticFile(src)} style={{
            position: 'absolute', left: 0, top: P_ST - shift, width: P_W, display: 'block',
          }} />
          <div style={{
            position: 'absolute', left: '50%', top: 8, width: 78, height: 22,
            marginLeft: -39, borderRadius: 11, background: '#000',
          }} />
        </div>
      </div>
    );
  };

const TERMS = ['MAX PAIN', 'GAMMA FLIP', 'WHALE FLOW', 'DARK POOL'];

/**
 * SubRow — 구독·좋아요·알림 (대표 지시 2026-08-20)
 * ---------------------------------------------------------------------------
 * ⛔ «전체 화면 엔드카드»로 만들지 않는다. 레퍼런스 6편(1,500만~1,500회) 마지막 3초를
 *    전부 뽑아 봤더니 «단 하나도» 구독 카드를 넣지 않았다. 쇼츠는 끝나면 0초로 되감기고,
 *    우리 승자 3편의 지속률 100.6·111.4·134.3% 가 전부 그 루프에서 나왔다.
 *    화면을 덮는 카드는 영상을 «끝난 것»으로 닫아 루프를 끊는다.
 * ⇒ 그래서 «한 줄 띠»로만 넣는다. 눈에는 띄되 화면을 가리지 않는다.
 * ⛔ 유튜브 로고·구독 버튼 디자인을 그대로 쓰지 않는다 (상표). 일반 도형으로 그린다.
 */
const ThumbUp: React.FC<{ s: number; c: string }> = ({ s: sz, c }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill={c}>
    <path d="M2 21h3V9H2v12zM22 10.5c0-.9-.7-1.6-1.6-1.6h-5.1l.8-3.7v-.3c0-.4-.2-.7-.4-1L14.8 3 8.9 8.9c-.3.3-.5.7-.5 1.2v8.3c0 .9.7 1.6 1.6 1.6h7.4c.7 0 1.3-.4 1.5-1l2.5-5.8c.1-.2.1-.4.1-.6v-1.7z" />
  </svg>
);
const Bell: React.FC<{ s: number; c: string }> = ({ s: sz, c }) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill={c}>
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.1-1.6-5.6-4.5-6.3V4c0-.8-.7-1.5-1.5-1.5S10.5 3.2 10.5 4v.7C7.6 5.4 6 7.9 6 11v5l-2 2v1h16v-1l-2-2z" />
  </svg>
);

const SubRow: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const p = ease(f, at, at + 16);
  const pop = 0.86 + p * 0.14;
  // 도착 후 한 번 «쿵» — 눈에 띄게. 반복 점멸은 하지 않는다(조잡해진다)
  const beat = f > at + 18 && f < at + 34 ? 1 + 0.06 * Math.sin((f - at - 18) / 16 * Math.PI) : 1;
  const chip: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, borderRadius: 999,
    padding: '12px 22px', fontFamily, fontSize: 30, fontWeight: 900,
    letterSpacing: '0.02em', whiteSpace: 'nowrap',
  };
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: 1424,
      display: 'flex', gap: 14, justifyContent: 'center',
      opacity: p, transform: `scale(${pop * beat})`,
    }}>
      <div style={{ ...chip, background: '#F03A2E', color: '#fff', boxShadow: '0 10px 28px rgba(240,58,46,0.45)' }}>
        SUBSCRIBE
      </div>
      <div style={{ ...chip, background: 'rgba(255,255,255,0.14)', color: '#fff', border: '2px solid rgba(255,255,255,0.5)' }}>
        <ThumbUp s={30} c="#fff" /> LIKE
      </div>
      <div style={{ ...chip, background: 'rgba(255,255,255,0.14)', color: '#fff', border: '2px solid rgba(255,255,255,0.5)' }}>
        <Bell s={30} c="#fff" />
      </div>
    </div>
  );
};

export const OutroCard: React.FC = () => {
  const f = useCurrentFrame();
  // ⛔ 등장이 «너무 빠르다» — 대표 확인. 같은 창 안에서 천천히 들어오게 늘린다.
  //    모든 애니메이션은 여전히 «2.6초(78프레임) 안»에 끝난다 (앞에서 잘려도 완성돼 보여야 함).
  const a = ease(f, 0, 18);
  const rise = interpolate(f, [0, 30], [70, 0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const pop = ease(f, 6, 26);

  return (
    <AbsoluteFill style={{ background: '#05070C' }}>
      {/* 배경 — 금색 터널. 브랜드 배경과 같은 톤 */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse 120% 80% at 50% 46%, rgba(86,62,18,0.95) 0%, rgba(28,22,10,0.96) 52%, #05070C 100%)',
      }} />

      {/* 상단 — 앱 이름 + FREE. FREE 가 화면에서 가장 큰 «약속» */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 118, textAlign: 'center', opacity: a }}>
        <div style={{
          fontFamily, fontSize: 68, fontWeight: 900, color: GOLD, letterSpacing: '-0.035em',
          textShadow: '0 4px 24px rgba(0,0,0,0.7)',
        }}>SIGNUM HQ</div>
        <div style={{
          marginTop: 16, display: 'inline-block', fontFamily, fontSize: 58, fontWeight: 900,
          color: '#0A0E16', background: GOLD, borderRadius: 999, padding: '15px 52px',
          letterSpacing: '0.01em', boxShadow: '0 14px 42px rgba(0,0,0,0.6)',
          transform: `scale(${0.88 + pop * 0.12})`,
        }}>FREE &middot; iOS &amp; Android</div>
      </div>

      {/* 폰 2대 — 같은 앱의 다른 화면. 영어 화면만 쓴다 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: TOP + rise, height: P_BOX }}>
        <Phone src="ad/tall-guardian.png" dx={214} scale={0.88} z={1} o={a * 0.95} tilt={5} shift={120} />
        <Phone src="ad/tall-command-overview.png" dx={-72} scale={1} z={2} o={a} tilt={-3} shift={56} />
      </div>

      {/* 지표 이름 — 이 앱이 파는 것. 한 줄 고정 */}
      <div style={{
        position: 'absolute', left: 20, right: 20, top: 1338,
        display: 'flex', flexWrap: 'nowrap', gap: 11, justifyContent: 'center',
      }}>
        {TERMS.map((t, i) => {
          const q = interpolate(f, [26 + i * 6, 40 + i * 6], [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.6)) });
          return (
            <div key={t} style={{
              fontFamily, fontSize: 29, fontWeight: 900, letterSpacing: '0.02em', whiteSpace: 'nowrap',
              color: '#08101C', background: GOLD, borderRadius: 9, padding: '10px 15px',
              opacity: q, transform: `scale(${0.82 + q * 0.18})`,
            }}>{t}</div>
          );
        })}
      </div>

      <SubRow at={50} />

      <div style={{
        position: 'absolute', left: 60, right: 60, top: 1518, textAlign: 'center',
        opacity: ease(f, 62, 78), fontFamily, fontSize: 34, fontWeight: 800,
        color: '#F4F8FE', letterSpacing: '-0.01em',
        textShadow: '0 3px 16px rgba(0,0,0,0.8)',
      }}>Free on iOS and Android &middot; signumhq.com/app</div>

      <div style={{
        position: 'absolute', left: 40, right: 40, bottom: 286, textAlign: 'center',
        fontFamily, fontSize: 23, fontWeight: 800, color: 'rgba(255,176,32,0.92)',
        textShadow: '0 2px 10px rgba(0,0,0,0.9)',
      }}>Educational only &middot; Not investment advice</div>
    </AbsoluteFill>
  );
};
