// ============================================================================
// TickerMark — 심볼 하나를 그리는 유일한 컴포넌트 (정본 §4)
// 실 로고면 «흰 플레이트 + contain», 지수·매크로·미보유면 «배지/모노그램».
// 어떤 라벨이 와도 빈칸이 나오지 않는다 (resolveSymbol 이 항상 무언가를 준다).
// ============================================================================

import React from 'react';
import { Img, staticFile } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
import { resolveSymbol, type SymbolRef } from '../kit/symbols';

const { fontFamily } = loadFont();

export const TickerMark: React.FC<{
  /** 티커 또는 지수 라벨 — 'NVDA' · 'NASDAQ100 F' · 'VIX' 무엇이든 */
  t: string;
  size: number;
  /** 이미 해석된 심볼을 넘기면 재해석하지 않는다 */
  ref_?: SymbolRef;
  style?: React.CSSProperties;
}> = ({ t, size, ref_, style }) => {
  const s = ref_ ?? resolveSymbol(t);
  const radius = Math.round(size * 0.24);

  if (s.kind === 'logo') {
    return (
      <div style={{
        width: size, height: size, borderRadius: radius, flexShrink: 0,
        background: 'rgba(255,255,255,0.96)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        ...style,
      }}>
        <Img src={staticFile(s.src)} style={{ width: size * 0.72, height: size * 0.72, objectFit: 'contain' }} />
      </div>
    );
  }

  // 배지/모노그램 — 티커별 고정 색이라 같은 종목은 항상 같은 색으로 보인다
  const c1 = `hsl(${s.hue} 62% 46%)`;
  const c2 = `hsl(${(s.hue + 26) % 360} 60% 27%)`;
  const len = s.text.length;
  const fs = Math.round(size * (len >= 4 ? 0.27 : len === 3 ? 0.32 : len === 2 ? 0.4 : 0.46));
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: `linear-gradient(135deg, ${c1}, ${c2})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
      ...style,
    }}>
      <span style={{
        fontFamily, fontSize: fs, fontWeight: 900, color: '#fff',
        letterSpacing: '-0.03em', lineHeight: 1,
      }}>{s.text}</span>
    </div>
  );
};

/** 훅 히어로 — 심볼 1개(단일 종목) 또는 최대 3개 클러스터(섹터·지수) */
export const SymbolHero: React.FC<{ syms: string[]; size: number }> = ({ syms, size }) => {
  const list = syms.slice(0, 3);
  if (list.length === 1) return <TickerMark t={list[0]} size={size} />;
  // 가운데가 크고 좌우가 작은 «삼각» 클러스터 — 주인공이 누구인지 즉시 읽힌다.
  // ⚠️ 겹치게 하지 않는다: 정사각 배지끼리 겹치면 글자가 가려진다(2026-08-10 실측).
  const center = Math.round(size * 0.86);
  const side = Math.round(size * 0.54);
  const [a, b, c] = [list[1] ?? list[0], list[0], list[2]];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 20 }}>
      <TickerMark t={a} size={side} style={{ marginTop: side * 0.5 }} />
      <TickerMark t={b} size={center} />
      {c && <TickerMark t={c} size={side} style={{ marginTop: side * 0.5 }} />}
    </div>
  );
};
