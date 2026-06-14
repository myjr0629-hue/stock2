'use client';
/* ============================================================
   05 — TickerIcon (드롭인 TSX)
   룰 1: 주요 티커 옆 하이파이 심볼 배지.
   브랜드 휴 그라데이션 + 모노그램 — 상표 로고 복제가 아닌
   오리지널 아트라 라이선스 이슈 없음.
   사용: <TickerIcon sym="SPY" size={18} />
   등록 안 된 티커는 회색 배지 + 첫 2글자로 폴백.
   ============================================================ */
import { type CSSProperties } from 'react';

const REGISTRY: Record<string, { c1: string; c2: string; g: string }> = {
  SPY:  { c1: '#7f1d1d', c2: '#dc2626', g: 'SP'  },
  QQQ:  { c1: '#0b3a6b', c2: '#2563eb', g: 'Q'   },
  VIX:  { c1: '#4c1d95', c2: '#8b5cf6', g: 'VX'  },
  DOW:  { c1: '#1e3a8a', c2: '#3b82f6', g: 'DJ'  },
  NDX:  { c1: '#0b4ea2', c2: '#38bdf8', g: 'NQ'  },
  US10Y:{ c1: '#14532d', c2: '#22c55e', g: '10Y' },
  DXY:  { c1: '#134e4a', c2: '#2dd4bf', g: '$'   },
  GOLD: { c1: '#92400e', c2: '#fbbf24', g: 'Au'  },
  BTC:  { c1: '#92400e', c2: '#f7931a', g: '₿'   },
  FNG:  { c1: '#7c2d12', c2: '#f97316', g: 'F&G' },
  NVDA: { c1: '#3f6212', c2: '#76b900', g: 'NV'  },
  TSLA: { c1: '#7f1d1d', c2: '#e82127', g: 'T'   },
  AAPL: { c1: '#334155', c2: '#94a3b8', g: 'A'   },
  AMD:  { c1: '#171717', c2: '#ed1c24', g: 'AMD' },
  META: { c1: '#1e3a8a', c2: '#0668e1', g: 'M'   },
  MSFT: { c1: '#1d4ed8', c2: '#60a5fa', g: 'MS'  },
  GOOGL:{ c1: '#1a73e8', c2: '#34a853', g: 'G'   },
  AMZN: { c1: '#92400e', c2: '#f59e0b', g: 'az'  },
};

export function TickerIcon({ sym, size = 18, style }: { sym: string; size?: number; style?: CSSProperties }) {
  const r = REGISTRY[sym] || { c1: '#1e293b', c2: '#475569', g: (sym || '?').slice(0, 2) };
  const id = `tk-${sym}-${size}`;
  const fs = r.g.length >= 3 ? size * 0.30 : r.g.length === 2 ? size * 0.40 : size * 0.50;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, display: 'block', ...style }} aria-label={sym}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={r.c2} /><stop offset="100%" stopColor={r.c1} />
        </linearGradient>
        <radialGradient id={`${id}-hl`} cx="0.3" cy="0.18" r="0.9">
          <stop offset="0%" stopColor="rgba(255,255,255,0.38)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0.06)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <rect x="0.5" y="0.5" width={size - 1} height={size - 1} rx={size * 0.28} fill={`url(#${id})`} stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      <rect x="0.5" y="0.5" width={size - 1} height={size - 1} rx={size * 0.28} fill={`url(#${id}-hl)`} />
      <text x="50%" y="52%" dominantBaseline="central" textAnchor="middle" fill="#fff"
        fontFamily="Inter, sans-serif" fontWeight={800} fontSize={fs} style={{ letterSpacing: '-0.02em' }}>{r.g}</text>
    </svg>
  );
}

/* 적용 위치 (시안 SIGNUM HQ — App v2.html 참고):
   - dash Market Pulse 셀 (SPY/QQQ/VIX, 17px)
   - dash Macro Board (US10Y/DXY/GOLD/BTC, 13px)
   - dash Top Movers (17px)
   - guardian Macro Grid (FNG/VIX/DOW/NDX, 13px)
   - cmd 헤더 티커 (20px)
   - flow 티커 필 (15px) + Underlying 카드 (24px)
   아이콘+텍스트는 flex gap 6px (.tk-row 패턴) */
