// ============================================================================
// AppShot — 실앱 캡처를 «잘리지 않게» 보여주는 공용 컴포넌트
// ----------------------------------------------------------------------------
// 이 버그는 V1·V3·V4·V5·V7에서 «다섯 번» 되살아났다. 매번 컴포지션을 복사할 때
// 옛 코드가 따라왔기 때문이다. 그래서 여기 한 곳으로 뺀다. 앞으로는 이것만 쓴다.
//
// 🐛 원인 (2026-08-04 실측)
//   `<Img style={{ top: `${-focus.y * scale * 100}%` }} />`
//   CSS 에서 top 의 % 는 **컨테이너 높이** 기준이지 «이미지 높이»가 아니다.
//   컨테이너가 520px 인데 이미지는 2400px 이라, 0.3 을 주면 이미지의 30%가 아니라
//   컨테이너의 30%(=156px)만 움직인다. 그래서 크롭이 원하는 데까지 절대 못 내려간다.
//   증상: «타일을 보여주려 했는데 상단 티커 칩만 나오고 아래가 잘림».
//
// ✅ 해결: 이미지 실제 픽셀 크기를 계산해서 px 로 배치한다.
//   앱 캡처는 전부 scripts/capture-app-screens.mjs 산출물 = 1206×2622 (@3x).
// ============================================================================

import { Img, staticFile } from 'remotion';

/** capture-app-screens.mjs 산출 규격 */
export const SHOT_SRC_W = 1206;
export const SHOT_SRC_H = 2622;
const ASPECT = SHOT_SRC_H / SHOT_SRC_W;

export interface ShotFocus {
  /** 왼쪽에서 시작 비율 (0~1, 이미지 기준) */
  x: number;
  /** 위에서 시작 비율 (0~1, 이미지 기준) */
  y: number;
  /** 가로로 몇 %를 보여줄지 (0~1). 작을수록 확대 */
  w: number;
}

export interface ShotBox {
  x: number; y: number; w: number; h: number;   // 이미지 기준 비율
}

export function AppShot({
  src, focus, width, height, box, boxOpacity = 1, radius = 20, brighten = 1.26,
}: {
  src: string;
  focus: ShotFocus;
  /** 패널의 실제 픽셀 폭 — 부모가 알려줘야 계산이 맞는다 */
  width: number;
  height: number;
  box?: ShotBox;
  boxOpacity?: number;
  radius?: number;
  brighten?: number;
}) {
  const imgW = width / focus.w;          // 가로 focus.w 만큼만 보이도록 확대
  const imgH = imgW * ASPECT;
  const left = -focus.x * imgW;
  const top = -focus.y * imgH;

  return (
    <div style={{
      width, height, borderRadius: radius, overflow: 'hidden', position: 'relative',
      border: '1px solid rgba(255,255,255,0.20)',
      boxShadow: '0 22px 60px rgba(0,0,0,0.6)', background: '#070C16',
    }}>
      <Img src={staticFile(src)} style={{
        position: 'absolute', width: imgW, height: imgH, left, top,
        maxWidth: 'none',
        filter: `brightness(${brighten}) contrast(1.08)`,
      }} />
      {box && (
        <div style={{
          position: 'absolute',
          left: left + box.x * imgW, top: top + box.y * imgH,
          width: box.w * imgW, height: box.h * imgH,
          border: '5px solid #FF5C74', borderRadius: 12,
          boxShadow: '0 0 26px rgba(255,92,116,0.55)', opacity: boxOpacity,
        }} />
      )}
    </div>
  );
}

/**
 * 앱 캡처의 «관심 영역» 프리셋 — 매번 좌표를 새로 찍지 않도록.
 * 값은 mu-cmd.png / signum-cmd.png 실측(1206×2622 기준).
 */
export const SHOT_PRESET = {
  /** 종목명 + 현재가 + PRE/POST 배지 */
  priceHeader: { x: 0.045, y: 0.196, w: 0.91 } as ShotFocus,
  /** MAX PAIN · GAMMA FLIP · TOTAL PREMIUM 타일 줄 */
  optionTiles: { x: 0.04, y: 0.258, w: 0.92 } as ShotFocus,
  /** 가격 + 타일까지 한 화면에 */
  headerAndTiles: { x: 0.04, y: 0.185, w: 0.92 } as ShotFocus,
  /** 타일 줄 안에서 GAMMA FLIP 칸 (빨간 네모용) */
  boxGammaFlip: { x: 0.355, y: 0.268, w: 0.285, h: 0.085 } as ShotBox,
  boxMaxPain: { x: 0.055, y: 0.268, w: 0.285, h: 0.085 } as ShotBox,
} as const;
