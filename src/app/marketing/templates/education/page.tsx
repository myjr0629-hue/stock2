'use client';

// ============================================================================
// Marketing Template: Education Card (Pinterest SEO optimized)
// /marketing/templates/education?topic=gex&format=pin&lang=en
// 교육 인포그래픽 — Pinterest 트래픽 핵심 (96/100 평가)
// Puppeteer captures this page → Supabase Storage → Buffer
// ============================================================================

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const FORMATS: Record<string, { width: number; height: number }> = {
  tweet:    { width: 1200, height: 675 },
  og:       { width: 1200, height: 630 },
  story:    { width: 1080, height: 1920 },
  carousel: { width: 1080, height: 1080 },
  pin:      { width: 1000, height: 1500 },
  square:   { width: 1080, height: 1080 },
};

interface TopicContent {
  title: Record<string, string>;
  subtitle: Record<string, string>;
  positive: { label: Record<string, string>; desc: Record<string, string>; emoji: string };
  negative: { label: Record<string, string>; desc: Record<string, string>; emoji: string };
  insight: Record<string, string>;
  color: string;
  accentColor: string;
}

const TOPICS: Record<string, TopicContent> = {
  gex: {
    title: {
      en: 'How Gamma Exposure\nDrives Stock Prices',
      ko: '감마 익스포저가\n주가를 움직이는 원리',
      ja: 'ガンマエクスポージャーが\n株価を動かす仕組み',
    },
    subtitle: {
      en: 'The invisible force behind every market move',
      ko: '모든 시장 움직임 뒤에 숨겨진 힘',
      ja: 'すべての市場変動の背後にある見えない力',
    },
    positive: {
      label: { en: 'Positive GEX', ko: 'GEX 양수(+)', ja: 'GEXプラス' },
      desc: {
        en: 'Dealers absorb volatility\nSmall moves stay small\nMarket stabilizes',
        ko: '딜러가 변동성을 흡수\n작은 움직임은 작게 유지\n시장 안정화',
        ja: 'ディーラーがボラティリティ吸収\n小さな動きは小さいまま\n市場安定化',
      },
      emoji: '🛡️',
    },
    negative: {
      label: { en: 'Negative GEX', ko: 'GEX 음수(−)', ja: 'GEXマイナス' },
      desc: {
        en: 'Dealers amplify moves\nSmall moves turn large\nVolatility expands',
        ko: '딜러가 움직임을 증폭\n작은 움직임이 커짐\n변동성 확대',
        ja: 'ディーラーが動きを増幅\n小さな動きが大きく\nボラティリティ拡大',
      },
      emoji: '⚡',
    },
    insight: {
      en: 'Knowing the current GEX regime is like knowing whether you are sailing with or against the wind.',
      ko: 'GEX 레짐을 아는 것은 순풍인지 역풍인지 아는 것과 같습니다.',
      ja: 'GEXレジームを知ることは、順風か逆風かを知ることと同じです。',
    },
    color: '#22d3ee',
    accentColor: '#7c3aed',
  },
  darkpool: {
    title: {
      en: 'Dark Pool Activity\nDecoded',
      ko: '다크풀 활동\n해독하기',
      ja: 'ダークプール活動を\n解読する',
    },
    subtitle: {
      en: 'Track institutional footprints invisible to most',
      ko: '대부분에게 보이지 않는 기관의 발자취를 추적',
      ja: 'ほとんどの人に見えない機関の足跡を追跡',
    },
    positive: {
      label: { en: 'High Activity (>40%)', ko: '높은 활동 (>40%)', ja: '高活動 (>40%)' },
      desc: {
        en: 'Institutions positioning\nDirectional moves follow\nSmart money active',
        ko: '기관 포지셔닝 중\n방향성 움직임 예고\n스마트 머니 활동',
        ja: '機関がポジショニング\n方向性の動きが続く\nスマートマネー活動中',
      },
      emoji: '🏦',
    },
    negative: {
      label: { en: 'Low Activity (<30%)', ko: '낮은 활동 (<30%)', ja: '低活動 (<30%)' },
      desc: {
        en: 'Retail-driven market\nDirection uncertain\nLower conviction',
        ko: '개인 주도 시장\n방향성 불확실\n확신도 낮음',
        ja: 'リテール主導の市場\n方向性不確実\n確信度低い',
      },
      emoji: '👤',
    },
    insight: {
      en: 'When dark pool activity exceeds 40%, directional moves have historically followed within 48 hours.',
      ko: '다크풀 활동이 40%를 초과하면, 역사적으로 48시간 내 방향성 움직임이 관찰됩니다.',
      ja: 'ダークプール活動が40%超の場合、歴史的に48時間以内に方向性の動きが観測されます。',
    },
    color: '#8b5cf6',
    accentColor: '#06b6d4',
  },
  vix: {
    title: {
      en: 'Understanding VIX\nFear & Greed Index',
      ko: 'VIX 이해하기\n공포와 탐욕 지수',
      ja: 'VIXを理解する\n恐怖と貪欲の指標',
    },
    subtitle: {
      en: "The market's built-in fear gauge",
      ko: '시장의 내장된 공포 게이지',
      ja: '市場に内蔵された恐怖ゲージ',
    },
    positive: {
      label: { en: 'VIX < 18 (Calm)', ko: 'VIX < 18 (안정)', ja: 'VIX < 18 (安定)' },
      desc: {
        en: 'Low fear in market\nOptions relatively cheap\nComplacency risk exists',
        ko: '시장 공포 낮음\n옵션 상대적 저렴\n안일함 리스크 존재',
        ja: '市場恐怖低い\nオプション比較的割安\n油断のリスクあり',
      },
      emoji: '😌',
    },
    negative: {
      label: { en: 'VIX > 25 (Fear)', ko: 'VIX > 25 (공포)', ja: 'VIX > 25 (恐怖)' },
      desc: {
        en: 'High fear in market\nOptions expensive\nPotential reversal zone',
        ko: '시장 공포 높음\n옵션 비쌈\n반전 가능 구간',
        ja: '市場恐怖高い\nオプション割高\n反転の可能性あり',
      },
      emoji: '😰',
    },
    insight: {
      en: 'Extreme VIX readings have historically coincided with major market turning points.',
      ko: '극단적 VIX 수치는 역사적으로 주요 시장 전환점과 일치해왔습니다.',
      ja: '極端なVIX値は歴史的に主要な市場転換点と一致してきました。',
    },
    color: '#f97316',
    accentColor: '#ef4444',
  },
};

function EducationCard() {
  const searchParams = useSearchParams();
  const topicKey = searchParams.get('topic') || 'gex';
  const format   = searchParams.get('format') || 'pin';
  const lang     = searchParams.get('lang') || 'en';

  const { width, height } = FORMATS[format] || FORMATS.pin;
  const isVertical = height > width;
  const topic = TOPICS[topicKey] || TOPICS.gex;

  const seeMore = lang === 'ko' ? '데이터로 확인하세요' 
    : lang === 'ja' ? 'データで確認してください' 
    : 'See What Others Cannot';

  return (
    <div style={{
      width: `${width}px`, height: `${height}px`,
      background: 'linear-gradient(180deg, #06090f 0%, #0c1220 50%, #06090f 100%)',
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Background effects */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.025,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />
        <div style={{
          position: 'absolute', left: '50%', top: '25%', transform: 'translate(-50%, -50%)',
          width: '70%', height: '40%',
          background: `radial-gradient(circle, ${topic.color}08 0%, transparent 70%)`,
        }} />
      </div>

      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        height: '100%',
        padding: isVertical ? '48px 40px' : '28px 40px',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(124,58,237,0.3)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192x192.png" alt="SIGNUM" width={28} height={28} style={{ borderRadius: '6px' }} />
            </div>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '3px' }}>
              SIGNUM HQ
            </span>
          </div>
          <div style={{
            padding: '5px 14px', borderRadius: '8px',
            background: `${topic.color}10`,
            border: `1px solid ${topic.color}30`,
          }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: topic.color, letterSpacing: '2px' }}>
              EDUCATION
            </span>
          </div>
        </div>

        {/* ── Title ── */}
        <div style={{
          marginTop: isVertical ? '40px' : '20px',
          textAlign: 'center',
        }}>
          <h1 style={{
            fontSize: isVertical ? '38px' : '30px',
            fontWeight: 900, color: '#f1f5f9',
            lineHeight: 1.15, margin: 0,
            whiteSpace: 'pre-line',
          }}>{topic.title[lang] || topic.title.en}</h1>
          <p style={{
            fontSize: '14px', color: '#64748b', fontWeight: 500,
            marginTop: '10px',
          }}>{topic.subtitle[lang] || topic.subtitle.en}</p>
        </div>

        {/* ── Dual Cards ── */}
        <div style={{
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          gap: '14px',
          marginTop: isVertical ? '36px' : '22px',
          flex: 1,
        }}>
          {/* Positive side */}
          <div style={{
            flex: 1,
            padding: isVertical ? '28px' : '20px',
            borderRadius: '16px',
            background: 'rgba(52,211,153,0.04)',
            border: '1px solid rgba(52,211,153,0.15)',
            display: 'flex', flexDirection: 'column',
            position: 'relative',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>{topic.positive.emoji}</div>
            <div style={{
              fontSize: isVertical ? '18px' : '15px', fontWeight: 800,
              color: '#34d399', letterSpacing: '1px',
            }}>
              {topic.positive.label[lang] || topic.positive.label.en}
            </div>
            <div style={{
              fontSize: isVertical ? '14px' : '12px',
              color: '#94a3b8', marginTop: '10px',
              lineHeight: 1.6, whiteSpace: 'pre-line',
            }}>
              {topic.positive.desc[lang] || topic.positive.desc.en}
            </div>
            {/* Icon: shield */}
            <div style={{
              position: 'absolute', bottom: '14px', right: '14px',
              fontSize: '11px', fontWeight: 700, color: '#34d399',
              padding: '4px 10px', borderRadius: '6px',
              background: 'rgba(52,211,153,0.1)',
            }}>
              SHOCK ABSORBER
            </div>
          </div>

          {/* VS divider */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <div style={{
              width: isVertical ? '48px' : '36px',
              height: isVertical ? '48px' : '36px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 800, color: '#64748b',
              letterSpacing: '1px',
            }}>
              VS
            </div>
          </div>

          {/* Negative side */}
          <div style={{
            flex: 1,
            padding: isVertical ? '28px' : '20px',
            borderRadius: '16px',
            background: 'rgba(248,113,113,0.04)',
            border: '1px solid rgba(248,113,113,0.15)',
            display: 'flex', flexDirection: 'column',
            position: 'relative',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>{topic.negative.emoji}</div>
            <div style={{
              fontSize: isVertical ? '18px' : '15px', fontWeight: 800,
              color: '#f87171', letterSpacing: '1px',
            }}>
              {topic.negative.label[lang] || topic.negative.label.en}
            </div>
            <div style={{
              fontSize: isVertical ? '14px' : '12px',
              color: '#94a3b8', marginTop: '10px',
              lineHeight: 1.6, whiteSpace: 'pre-line',
            }}>
              {topic.negative.desc[lang] || topic.negative.desc.en}
            </div>
            <div style={{
              position: 'absolute', bottom: '14px', right: '14px',
              fontSize: '11px', fontWeight: 700, color: '#f87171',
              padding: '4px 10px', borderRadius: '6px',
              background: 'rgba(248,113,113,0.1)',
            }}>
              VOLATILITY MULTIPLIER
            </div>
          </div>
        </div>

        {/* ── Insight Box ── */}
        <div style={{
          marginTop: isVertical ? '24px' : '14px',
          padding: isVertical ? '20px 24px' : '12px 20px',
          borderRadius: '12px',
          background: `${topic.color}06`,
          border: `1px solid ${topic.color}15`,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: topic.color, letterSpacing: '2px', marginBottom: '6px' }}>
            💡 KEY INSIGHT
          </div>
          <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5, margin: 0 }}>
            {topic.insight[lang] || topic.insight.en}
          </p>
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: isVertical ? '20px' : '12px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: topic.color, letterSpacing: '1px' }}>
            {seeMore}
          </span>
          <span style={{ fontSize: '11px', color: '#475569', letterSpacing: '2px' }}>SIGNAL. ANALYZE. EXECUTE.</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>signumhq.com</span>
        </div>
      </div>
    </div>
  );
}

export default function EducationTemplatePage() {
  return (
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { margin: 0; padding: 0; background: #000; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        `}</style>
      </head>
      <body>
        <Suspense fallback={<div style={{color:'#fff'}}>Loading...</div>}>
          <EducationCard />
        </Suspense>
      </body>
    </html>
  );
}
