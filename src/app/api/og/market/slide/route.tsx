// ============================================================================
// /api/og/market/slide — IG Carousel Slide Generator
// 개별 슬라이드별 디자인 (hook/data/gex/darkpool/insight/cta)
// 1080×1350 (4:5) Instagram carousel format
// ============================================================================

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const C = {
  bgDark:    '#050a14',
  glass:     'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.12)',
  cyan:      '#22d3ee',
  cyanDim:   '#06b6d4',
  purple:    '#a78bfa',
  purpleDim: '#7c3aed',
  green:     '#34d399',
  red:       '#f87171',
  amber:     '#fbbf24',
  white:     '#f8fafc',
  muted:     '#cbd5e1',
  dim:       '#94a3b8',
};

const L: Record<string, Record<string, string>> = {
  en: {
    hook_title: 'MARKET STRUCTURE',
    data_title: 'TODAY\'S DATA',
    gex_title: 'GEX REGIME',
    darkpool_title: 'NEW INSTITUTIONAL POSITIONS',
    inst_call: 'CALLS',
    inst_put: 'PUTS',
    insight_title: 'KEY INSIGHT',
    cta_title: 'SIGNUM HQ',
    swipe_hook: 'See today\'s data →',
    swipe_data: 'The real signal hides deeper →',
    swipe_gex: 'Where is Smart Money? →',
    swipe_dp: 'One key takeaway →',
    swipe_insight: 'Don\'t miss the action plan →',
    save: 'Save this post',
    linkInBio: 'Full analysis → Link in bio',
    positive: 'POSITIVE', negative: 'NEGATIVE', neutral: 'NEUTRAL', transition: 'TRANSITION',
    gex_pos_desc: 'Dealers absorb shocks.\nVolatility compressed.',
    gex_neg_desc: 'Small moves turn into large ones.\nTrends accelerate.',
    gex_trans_desc: 'Regime transition in progress.\nWatch for confirmation.',
    tagline: 'See What Others Cannot',
  },
  ko: {
    hook_title: '시장 구조 분석',
    data_title: '오늘의 데이터',
    gex_title: 'GEX 레짐',
    darkpool_title: '기관 신규 포지션',
    inst_call: '콜',
    inst_put: '풋',
    insight_title: '핵심 인사이트',
    cta_title: 'SIGNUM HQ',
    swipe_hook: '오늘의 데이터 보기 →',
    swipe_data: '진짜 시그널은 더 깊이 숨어있다 →',
    swipe_gex: '기관 자금은 어디로? →',
    swipe_dp: '핵심 인사이트 보기 →',
    swipe_insight: '실전 액션 플랜 →',
    save: '이 포스트를 저장하세요',
    linkInBio: '전체 분석 보기',
    positive: 'POSITIVE', negative: 'NEGATIVE', neutral: 'NEUTRAL', transition: 'TRANSITION',
    gex_pos_desc: '딜러가 충격을 흡수합니다.\n변동성이 억제됩니다.',
    gex_neg_desc: '작은 움직임이\n큰 움직임으로 전환됩니다.',
    gex_trans_desc: '레짐 전환 중입니다.\n확인을 기다리십시오.',
    tagline: '시장의 이면을 읽다',
  },
  ja: {
    hook_title: 'マーケット構造分析',
    data_title: '本日のデータ',
    gex_title: 'GEXレジーム',
    darkpool_title: '機関の新規ポジション',
    inst_call: 'コール',
    inst_put: 'プット',
    insight_title: 'キーインサイト',
    cta_title: 'SIGNUM HQ',
    swipe_hook: 'Data →',
    swipe_data: 'Signal →',
    swipe_gex: 'Smart Money →',
    swipe_dp: 'Insight →',
    swipe_insight: 'Action →',
    save: 'Save this post',
    linkInBio: 'Full analysis',
    positive: 'POSITIVE', negative: 'NEGATIVE', neutral: 'NEUTRAL', transition: 'TRANSITION',
    gex_pos_desc: 'Shock absorbed.\nVolatility suppressed.',
    gex_neg_desc: 'Small moves become\nlarge moves.',
    gex_trans_desc: 'Regime transition.\nWatch closely.',
    tagline: 'See What Others Cannot',
  },
};

function changeColor(v: number) { return v > 0 ? C.green : v < 0 ? C.red : C.muted; }
function fmt(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }
function gexColor(g: string) {
  const gl = g.toLowerCase();
  if (gl === 'positive') return { from: '#059669', to: '#34d399' };
  if (gl === 'negative') return { from: '#dc2626', to: '#f87171' };
  if (gl === 'transition') return { from: '#d97706', to: '#fbbf24' };
  return { from: '#4b5563', to: '#9ca3af' };
}

// SVG logo as base64 (same as main OG route)
const LOGO_SVG = "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4NCjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIyNDYgMjQ3IDUzMCA1MzAiIHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIj4NCiAgPHBhdGggZD0iTSAyNjYuMDk1LDQ3MC4xNDQgQzI2Ny43MTUsNDM0LjYwMyAyNzMuMDkxLDM4Mi4zNjQgMjc2LjUzNywzNjguNjg0IEMgMjgxLjE0OCwzNTAuMzgxIDI4OS40MTgsMzMxLjcxMSAyOTguNzY2LDMxOC41MDAgQyAzMTAuMjY2LDMwMi4yNDggMzI3LjA1OSwyODguMzQyIDM0Ni41MDAsMjc4Ljk3MyBDIDM3MC42MDEsMjY3LjM1OCAzODQuNDUxLDI2NC40MjcgNDM0LjUwMCwyNjAuMzUyIiBmaWxsPSJ3aGl0ZSIvPg0KICA8cGF0aCBkPSJNIDQzNi4xMDksNjI4LjcyMiBDIDU5OC4yNTIsNjI4LjM4MyA1OTkuNTg0LDYyOC4zNjQgNjEwLjUwMCw2MjYuMjQxIiBmaWxsPSJ3aGl0ZSIvPg0KPC9zdmc+DQo=";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const slide  = searchParams.get('slide') || 'hook';
  const lang   = (searchParams.get('lang') || 'en') as 'en' | 'ko' | 'ja';
  const spy    = parseFloat(searchParams.get('spy') || '0');
  const qqq    = parseFloat(searchParams.get('qqq') || '0');
  const vix    = parseFloat(searchParams.get('vix') || '0');
  const gex    = searchParams.get('gex') || 'neutral';
  const date   = searchParams.get('date') || new Date().toISOString().split('T')[0];
  // ⚠️ 다크풀(`dp`)은 2026-08-28 벤더 권한 상실로 **영구 소멸**했다.
  //    그런데 이 슬라이드는 `darkPool || '42.3'` 로 42.3% 를 그려 «발행되는
  //    OG 이미지»에 존재하지 않는 숫자를 실어 내보내고 있었다.
  //    (dp=0 이 들어오면 문자열 '0' 이 truthy 라 「0%」가 나갔다.)
  //    대체: 기관 신규 포지션 — 금액(in) + 콜 비중(cp).
  const instNotional = parseFloat(searchParams.get('in') || '0');
  const instCallPct = parseFloat(searchParams.get('cp') || '0');
  const hasInst = Number.isFinite(instNotional) && instNotional > 0
    && Number.isFinite(instCallPct) && instCallPct > 0;
  const instMoney = instNotional >= 1e12 ? `$${(instNotional / 1e12).toFixed(1)}T`
    : instNotional >= 1e9 ? `$${(instNotional / 1e9).toFixed(1)}B`
    : `$${(instNotional / 1e6).toFixed(0)}M`;

  const l = L[lang] || L.en;
  const gc = gexColor(gex);
  const gexLabel = l[gex.toLowerCase() as keyof typeof l] || gex.toUpperCase();

  // Slide-specific accent gradients (Phase 2-7: Visual differentiation)
  const slideBg: Record<string, string> = {
    hook:     `radial-gradient(ellipse 80% 50% at 50% 30%, rgba(99,102,241,0.18) 0%, transparent 60%),
               radial-gradient(ellipse 60% 40% at 50% 80%, rgba(6,182,212,0.12) 0%, transparent 50%)`,
    data:     `radial-gradient(ellipse 70% 50% at 30% 40%, rgba(34,211,238,0.15) 0%, transparent 55%),
               radial-gradient(ellipse 50% 50% at 80% 70%, rgba(52,211,153,0.10) 0%, transparent 50%)`,
    gex:      `radial-gradient(ellipse 80% 60% at 50% 25%, ${gc.from}25 0%, transparent 60%),
               radial-gradient(ellipse 50% 40% at 50% 85%, ${gc.to}15 0%, transparent 50%)`,
    darkpool: `radial-gradient(ellipse 70% 50% at 60% 35%, rgba(168,85,247,0.18) 0%, transparent 55%),
               radial-gradient(ellipse 50% 40% at 30% 75%, rgba(139,92,246,0.10) 0%, transparent 50%)`,
    insight:  `radial-gradient(ellipse 80% 50% at 40% 30%, rgba(251,191,36,0.12) 0%, transparent 55%),
               radial-gradient(ellipse 50% 40% at 70% 80%, rgba(245,158,11,0.08) 0%, transparent 50%)`,
    cta:      `radial-gradient(ellipse 90% 60% at 50% 50%, rgba(99,102,241,0.20) 0%, transparent 60%),
               radial-gradient(ellipse 60% 40% at 50% 80%, rgba(34,211,238,0.15) 0%, transparent 50%)`,
  };

  // Common wrapper
  const wrapper = (children: any) => (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: C.bgDark, position: 'relative', overflow: 'hidden',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    }}>
      {/* Background gradient — unique per slide */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
        background: slideBg[slide] || slideBg.hook,
      }} />
      {/* Grid */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
        backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '48px 40px', position: 'relative' }}>
        {children}
      </div>
    </div>
  );

  let content: any;

  switch (slide) {
    // ========================================
    // HOOK — First slide (stop the scroll)
    // ========================================
    case 'hook':
      content = wrapper(
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '32px' }}>
            {/* Logo */}
            <div style={{
              width: '80px', height: '80px', borderRadius: '20px', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${C.purpleDim}, ${C.cyanDim})`,
              boxShadow: `0 0 40px rgba(99,102,241,0.5)`,
            }}>
              <span style={{ fontSize: '36px', fontWeight: 900, color: C.white }}>SG</span>
            </div>
            {/* Title */}
            <span style={{
              fontSize: '48px', fontWeight: 900, color: C.white, textAlign: 'center', letterSpacing: '2px',
            }}>
              {l.hook_title}
            </span>
            {/* Date */}
            <span style={{ fontSize: '20px', color: C.muted, letterSpacing: '2px' }}>
              {date}
            </span>
            {/* GEX badge */}
            <div style={{
              display: 'flex', padding: '16px 40px', borderRadius: '16px',
              background: `linear-gradient(135deg, ${gc.from}33, ${gc.to}22)`,
              border: `2px solid ${gc.to}66`,
            }}>
              <span style={{
                fontSize: '32px', fontWeight: 800, letterSpacing: '2px',
                background: `linear-gradient(135deg, ${gc.from}, ${gc.to})`,
                backgroundClip: 'text', color: 'transparent',
              }}>
                GEX: {gexLabel}
              </span>
            </div>
          </div>
          {/* Swipe indicator */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <span style={{ fontSize: '18px', color: C.cyan, letterSpacing: '2px', fontWeight: 600 }}>
              {l.swipe_hook}
            </span>
          </div>
        </>
      );
      break;

    // ========================================
    // DATA — SPY / QQQ / VIX cards
    // ========================================
    case 'data':
      content = wrapper(
        <>
          <span style={{ fontSize: '16px', fontWeight: 700, color: C.dim, letterSpacing: '4px', marginBottom: '24px' }}>
            {l.data_title}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '20px', justifyContent: 'center' }}>
            {/* SPY */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '32px', borderRadius: '20px',
              background: C.glass, border: `1px solid ${C.glassBorder}`,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '14px', color: C.muted, letterSpacing: '3px', fontWeight: 700 }}>SPY</span>
                <span style={{ fontSize: '12px', color: C.dim }}>S&P 500</span>
              </div>
              <span style={{ fontSize: '48px', fontWeight: 900, color: changeColor(spy) }}>{fmt(spy)}</span>
            </div>
            {/* QQQ */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '32px', borderRadius: '20px',
              background: C.glass, border: `1px solid ${C.glassBorder}`,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '14px', color: C.muted, letterSpacing: '3px', fontWeight: 700 }}>QQQ</span>
                <span style={{ fontSize: '12px', color: C.dim }}>NASDAQ 100</span>
              </div>
              <span style={{ fontSize: '48px', fontWeight: 900, color: changeColor(qqq) }}>{fmt(qqq)}</span>
            </div>
            {/* VIX */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '32px', borderRadius: '20px',
              background: C.glass, border: `1px solid ${C.glassBorder}`,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '14px', color: C.muted, letterSpacing: '3px', fontWeight: 700 }}>VIX</span>
                <span style={{ fontSize: '12px', color: C.dim }}>Volatility Index</span>
              </div>
              <span style={{ fontSize: '48px', fontWeight: 900, color: vix >= 25 ? C.red : vix >= 18 ? C.amber : C.green }}>{vix.toFixed(1)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <span style={{ fontSize: '18px', color: C.cyan, letterSpacing: '2px', fontWeight: 600 }}>{l.swipe_data}</span>
          </div>
        </>
      );
      break;

    // ========================================
    // GEX — Regime explanation
    // ========================================
    case 'gex':
      content = wrapper(
        <>
          <span style={{ fontSize: '16px', fontWeight: 700, color: C.dim, letterSpacing: '4px', marginBottom: '24px' }}>
            {l.gex_title}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '40px' }}>
            {/* Large GEX label */}
            <span style={{
              fontSize: '72px', fontWeight: 900, letterSpacing: '4px',
              background: `linear-gradient(135deg, ${gc.from}, ${gc.to})`,
              backgroundClip: 'text', color: 'transparent',
            }}>
              {gexLabel}
            </span>
            {/* Description */}
            <div style={{
              display: 'flex', padding: '32px', borderRadius: '20px', width: '100%',
              background: `linear-gradient(135deg, ${gc.from}15, ${gc.to}08)`,
              border: `1px solid ${gc.to}33`,
            }}>
              <span style={{ fontSize: '24px', color: C.white, lineHeight: 1.8, whiteSpace: 'pre-line', textAlign: 'center', width: '100%' }}>
                {gex.toLowerCase() === 'positive' ? l.gex_pos_desc : gex.toLowerCase() === 'negative' ? l.gex_neg_desc : l.gex_trans_desc}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <span style={{ fontSize: '18px', color: C.cyan, letterSpacing: '2px', fontWeight: 600 }}>{l.swipe_gex}</span>
          </div>
        </>
      );
      break;

    // ========================================
    // DARKPOOL — Activity indicator
    // ========================================
    case 'darkpool':
      content = wrapper(
        <>
          <span style={{ fontSize: '16px', fontWeight: 700, color: C.dim, letterSpacing: '4px', marginBottom: '24px' }}>
            {l.darkpool_title}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '40px' }}>
            <span style={{ fontSize: '80px', fontWeight: 900, color: C.cyan }}>
              {hasInst ? instMoney : '—'}
            </span>
            {/* 콜/풋 비중 — 값이 없으면 막대를 «안 그린다» */}
            {hasInst && (
              <div style={{ display: 'flex', width: '80%', height: '16px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)' }}>
                <div style={{
                  width: `${Math.max(0, Math.min(100, instCallPct))}%`, height: '100%', borderRadius: '8px',
                  background: `linear-gradient(90deg, ${C.cyanDim}, ${C.cyan})`,
                }} />
              </div>
            )}
            {hasInst && (
              <div style={{ display: 'flex', width: '80%', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '22px', color: C.cyan, fontWeight: 700 }}>{l.inst_call} {instCallPct.toFixed(0)}%</span>
                <span style={{ fontSize: '22px', color: C.muted, fontWeight: 700 }}>{l.inst_put} {(100 - instCallPct).toFixed(0)}%</span>
              </div>
            )}
            <div style={{
              display: 'flex', padding: '24px 32px', borderRadius: '16px', width: '100%',
              background: C.glass, border: `1px solid ${C.glassBorder}`,
            }}>
              <span style={{ fontSize: '22px', color: C.muted, lineHeight: 1.8, textAlign: 'center', width: '100%' }}>
                {lang === 'ko' ? '기관이 수면 아래에서\n포지션을 구축하고 있습니다' : lang === 'ja' ? '機関が水面下で\nポジションを構築しています' : 'Institutions are positioning\nbeneath the surface'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <span style={{ fontSize: '18px', color: C.cyan, letterSpacing: '2px', fontWeight: 600 }}>{l.swipe_dp}</span>
          </div>
        </>
      );
      break;

    // ========================================
    // INSIGHT — Key takeaway
    // ========================================
    case 'insight':
      content = wrapper(
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '40px' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: C.dim, letterSpacing: '4px' }}>
            {l.insight_title}
          </span>
          <div style={{
            display: 'flex', padding: '40px', borderRadius: '20px',
            background: 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(34,211,238,0.08))',
            border: '1px solid rgba(168,85,247,0.2)',
          }}>
            <span style={{ fontSize: '28px', fontWeight: 700, color: C.white, lineHeight: 1.8, textAlign: 'center', fontStyle: 'italic' }}>
              {lang === 'ko' ? '"가격은 현상이지만,\n옵션 구조는 본질입니다."' : lang === 'ja' ? '"価格は現象ですが、\nオプション構造は本質です。"' : '"Price is the symptom.\nOptions structure is the cause."'}
            </span>
          </div>
          <span style={{ fontSize: '18px', color: C.dim, letterSpacing: '2px' }}>
            — SIGNUM HQ
          </span>
        </div>
      );
      break;

    // ========================================
    // CTA — Final slide
    // ========================================
    case 'cta':
    default:
      content = wrapper(
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '32px' }}>
          {/* Logo */}
          <div style={{
            width: '100px', height: '100px', borderRadius: '24px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, ${C.purpleDim}, ${C.cyanDim})`,
            boxShadow: `0 0 60px rgba(99,102,241,0.5)`,
          }}>
            <span style={{ fontSize: '44px', fontWeight: 900, color: C.white }}>SG</span>
          </div>
          <span style={{
            fontSize: '40px', fontWeight: 900, letterSpacing: '4px',
            background: `linear-gradient(135deg, ${C.purple}, ${C.cyan})`,
            backgroundClip: 'text', color: 'transparent',
          }}>
            SIGNUM HQ
          </span>
          <span style={{ fontSize: '22px', color: C.muted, letterSpacing: '1px' }}>
            {l.tagline}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
            <span style={{ fontSize: '24px', fontWeight: 700, color: C.white }}>
              {l.save}
            </span>
            <span style={{ fontSize: '20px', color: C.cyan, fontWeight: 600 }}>
              📊 {l.linkInBio}
            </span>
            <span style={{ fontSize: '16px', color: C.dim, marginTop: '8px' }}>
              signumhq.com
            </span>
          </div>
        </div>
      );
      break;
  }

  return new ImageResponse(content, { width: 1080, height: 1350, fonts: await loadFonts() });
}

// ---------------------------------------------------------------------------
// Font loader — Inter from Google Fonts (cached at edge)
// ---------------------------------------------------------------------------
let _fontCache: { name: string; data: ArrayBuffer; weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900; style: 'normal' | 'italic' }[] | null = null;

async function loadFonts() {
  if (_fontCache) return _fontCache;
  try {
    const [regular, bold] = await Promise.all([
      fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf').then(r => r.arrayBuffer()),
      fetch('https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf').then(r => r.arrayBuffer()),
    ]);
    _fontCache = [
      { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
      { name: 'Inter', data: bold, weight: 700 as const, style: 'normal' as const },
    ];
  } catch {
    _fontCache = [];
  }
  return _fontCache;
}
