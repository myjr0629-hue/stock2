'use client';

// ============================================================================
// Marketing Template: Education Card V2 (Pinterest/IG optimized)
// Hybrid: Gemini 가독성 + GPT 시각화 + Claude 데이터
// /marketing/templates/education?topic=gex&format=pin&lang=en
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
  positive: { label: Record<string, string>; desc: Record<string, string>; keyword: string; icon: string };
  negative: { label: Record<string, string>; desc: Record<string, string>; keyword: string; icon: string };
  insight: Record<string, string>;
  dataHints: { label: string; value: string; color: string }[];
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
      en: 'The invisible force behind every market reversal',
      ko: '모든 시장 반전 뒤에 숨겨진 보이지 않는 힘',
      ja: 'すべての市場反転の背後にある見えない力',
    },
    positive: {
      label: { en: 'Positive GEX', ko: 'GEX 양수(+)', ja: 'GEXプラス' },
      desc: {
        en: 'Dealers absorb volatility\nBuy dips, sell rips\nMarket mean-reverts',
        ko: '딜러가 변동성 흡수\n하락 시 매수, 상승 시 매도\n시장 평균회귀',
        ja: 'ディーラーがボラ吸収\n押し目買い、戻り売り\n平均回帰',
      },
      keyword: 'MEAN REVERSION',
      icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    },
    negative: {
      label: { en: 'Negative GEX', ko: 'GEX 음수(−)', ja: 'GEXマイナス' },
      desc: {
        en: 'Dealers amplify moves\nChase dips and rips\nVolatility expands',
        ko: '딜러가 움직임 증폭\n하락/상승 추격\n변동성 확대',
        ja: 'ディーラーが動き増幅\n追随売買\nボラ拡大',
      },
      keyword: 'MOVE AMPLIFICATION',
      icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    },
    insight: {
      en: 'Knowing the GEX regime is like knowing whether you\'re sailing with or against the wind.',
      ko: 'GEX 레짐을 아는 것은 순풍인지 역풍인지 아는 것과 같습니다.',
      ja: 'GEXレジームを知ることは、順風か逆風かを知ることです。',
    },
    dataHints: [
      { label: 'SPY GEX', value: '-$2.4B', color: '#f87171' },
      { label: 'VIX SPIKE', value: '+18.5%', color: '#fbbf24' },
      { label: 'REGIME', value: 'NEGATIVE', color: '#f87171' },
    ],
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
      keyword: 'ACCUMULATION',
      icon: 'M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4z',
    },
    negative: {
      label: { en: 'Low Activity (<30%)', ko: '낮은 활동 (<30%)', ja: '低活動 (<30%)' },
      desc: {
        en: 'Retail-driven market\nDirection uncertain\nLower conviction',
        ko: '개인 주도 시장\n방향성 불확실\n확신도 낮음',
        ja: 'リテール主導の市場\n方向性不確実\n確信度低い',
      },
      keyword: 'RETAIL DRIVEN',
      icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    },
    insight: {
      en: 'When dark pool activity exceeds 40%, directional moves have historically followed within 48 hours.',
      ko: '다크풀 활동이 40%를 초과하면, 역사적으로 48시간 내 방향성 움직임이 관찰됩니다.',
      ja: 'ダークプール活動が40%超の場合、歴史的に48時間以内に方向性の動きが観測されます。',
    },
    dataHints: [
      { label: 'DP RATIO', value: '47.3%', color: '#a855f7' },
      { label: 'BLOCK TRADES', value: '1,247', color: '#fbbf24' },
      { label: 'SIGNAL', value: 'INSTITUTIONAL', color: '#34d399' },
    ],
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
      en: "The market's built-in thermometer for fear",
      ko: '시장의 내장된 공포 온도계',
      ja: '市場に内蔵された恐怖の温度計',
    },
    positive: {
      label: { en: 'VIX < 18 (Calm)', ko: 'VIX < 18 (안정)', ja: 'VIX < 18 (安定)' },
      desc: {
        en: 'Low fear in market\nOptions relatively cheap\nComplacency risk exists',
        ko: '시장 공포 낮음\n옵션 상대적 저렴\n안일함 리스크 존재',
        ja: '市場恐怖低い\nオプション比較的割安\n油断のリスクあり',
      },
      keyword: 'COMPLACENCY',
      icon: 'M14.828 14.828a4 4 0 0 1-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    },
    negative: {
      label: { en: 'VIX > 25 (Fear)', ko: 'VIX > 25 (공포)', ja: 'VIX > 25 (恐怖)' },
      desc: {
        en: 'High fear in market\nOptions expensive\nPotential reversal zone',
        ko: '시장 공포 높음\n옵션 비쌈\n반전 가능 구간',
        ja: '市場恐怖高い\nオプション割高\n反転の可能性あり',
      },
      keyword: 'REVERSAL ZONE',
      icon: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
    },
    insight: {
      en: 'Extreme VIX readings have historically coincided with major market turning points — both tops and bottoms.',
      ko: '극단적 VIX 수치는 역사적으로 주요 시장 전환점(고점·저점)과 일치해왔습니다.',
      ja: '極端なVIX値は歴史的に主要な市場転換点（天井と底）と一致してきました。',
    },
    dataHints: [
      { label: 'VIX', value: '28.5', color: '#ef4444' },
      { label: 'VIX 5D Δ', value: '+42%', color: '#f97316' },
      { label: 'REGIME', value: 'FEAR', color: '#ef4444' },
    ],
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
      background: '#080c14',
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      overflow: 'hidden', position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Background effects */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: '-100px', right: '-100px', width: '500px', height: '500px',
          background: `radial-gradient(circle, ${topic.accentColor}18 0%, transparent 60%)`,
        }} />
        <div style={{
          position: 'absolute', bottom: '-100px', left: '-100px', width: '500px', height: '500px',
          background: `radial-gradient(circle, ${topic.color}12 0%, transparent 60%)`,
        }} />
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.02,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />
      </div>

      {/* Border glow */}
      <div style={{
        position: 'absolute', inset: '6px', borderRadius: '14px', pointerEvents: 'none', zIndex: 1,
        border: `1px solid ${topic.color}20`,
        boxShadow: `0 0 30px ${topic.accentColor}08, 0 0 60px ${topic.color}05`,
      }} />

      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column',
        height: '100%',
        padding: isVertical ? '44px 40px' : '24px 36px',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 16px rgba(124,58,237,0.3)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192x192.png" alt="SIGNUM" width={26} height={26} style={{ borderRadius: '6px' }} />
            </div>
            <span style={{ fontSize: '17px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '2px' }}>SIGNUM HQ</span>
          </div>
          <div style={{
            padding: '5px 14px', borderRadius: '20px',
            background: `${topic.color}10`, border: `1px solid ${topic.color}25`,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: topic.color }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: topic.color, letterSpacing: '0.15em' }}>MARKET STRUCTURE</span>
          </div>
        </div>

        {/* ── Title ── */}
        <div style={{ marginTop: isVertical ? '36px' : '16px' }}>
          <h1 style={{
            fontSize: isVertical ? '42px' : '32px',
            fontWeight: 900, color: '#f1f5f9',
            lineHeight: 1.1, margin: 0, whiteSpace: 'pre-line',
            letterSpacing: '-0.02em',
          }}>{topic.title[lang] || topic.title.en}</h1>
          <p style={{
            fontSize: '14px', color: '#64748b', fontWeight: 500, marginTop: '10px',
          }}>{topic.subtitle[lang] || topic.subtitle.en}</p>
        </div>

        {/* ── GEX Regime Gauge (GPT inspired) ── */}
        {topicKey === 'gex' && (
          <div style={{
            marginTop: isVertical ? '24px' : '12px',
            padding: '14px 20px', borderRadius: '12px',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.15em', marginBottom: '8px' }}>GEX REGIME</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '20px' }}>
              <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)', opacity: 0.8 }} />
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: '#1e293b', border: '2px solid rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 900, color: '#f1f5f9',
                boxShadow: '0 0 12px rgba(0,0,0,0.5)',
              }}>»</div>
              <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'linear-gradient(90deg, #34d399 0%, #22d3ee 100%)', opacity: 0.8 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#f87171', letterSpacing: '0.1em' }}>NEGATIVE</span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#34d399', letterSpacing: '0.1em' }}>POSITIVE</span>
            </div>
          </div>
        )}

        {/* ── Dual Cards ── */}
        <div style={{
          display: 'flex', flexDirection: isVertical ? 'column' : 'row',
          gap: '12px', marginTop: isVertical ? '24px' : '14px', flex: 1,
        }}>
          {/* Positive */}
          <div style={{
            flex: 1, padding: isVertical ? '24px' : '18px', borderRadius: '14px',
            background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.12)',
            borderLeft: '3px solid #34d399',
            display: 'flex', flexDirection: 'column', position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={topic.positive.icon} /></svg>
              </div>
              <span style={{ fontSize: isVertical ? '17px' : '14px', fontWeight: 800, color: '#34d399', letterSpacing: '0.5px' }}>
                {topic.positive.label[lang] || topic.positive.label.en}
              </span>
            </div>
            <div style={{
              fontSize: isVertical ? '14px' : '12px', color: '#cbd5e1',
              lineHeight: 1.7, whiteSpace: 'pre-line', flex: 1,
            }}>
              {topic.positive.desc[lang] || topic.positive.desc.en}
            </div>
            <div style={{
              marginTop: '10px', padding: '5px 12px', borderRadius: '6px',
              background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)',
              alignSelf: 'flex-start',
            }}>
              <span style={{ fontSize: '9px', fontWeight: 800, color: '#34d399', letterSpacing: '0.12em' }}>{topic.positive.keyword}</span>
            </div>
          </div>

          {/* VS */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{
              width: isVertical ? '44px' : '32px', height: isVertical ? '44px' : '32px',
              borderRadius: '50%', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontWeight: 800, color: '#475569', letterSpacing: '1px',
            }}>VS</div>
          </div>

          {/* Negative */}
          <div style={{
            flex: 1, padding: isVertical ? '24px' : '18px', borderRadius: '14px',
            background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.12)',
            borderLeft: '3px solid #f87171',
            display: 'flex', flexDirection: 'column', position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={topic.negative.icon} /></svg>
              </div>
              <span style={{ fontSize: isVertical ? '17px' : '14px', fontWeight: 800, color: '#f87171', letterSpacing: '0.5px' }}>
                {topic.negative.label[lang] || topic.negative.label.en}
              </span>
            </div>
            <div style={{
              fontSize: isVertical ? '14px' : '12px', color: '#cbd5e1',
              lineHeight: 1.7, whiteSpace: 'pre-line', flex: 1,
            }}>
              {topic.negative.desc[lang] || topic.negative.desc.en}
            </div>
            <div style={{
              marginTop: '10px', padding: '5px 12px', borderRadius: '6px',
              background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)',
              alignSelf: 'flex-start',
            }}>
              <span style={{ fontSize: '9px', fontWeight: 800, color: '#f87171', letterSpacing: '0.12em' }}>{topic.negative.keyword}</span>
            </div>
          </div>
        </div>

        {/* ── Terminal Data Hints (Claude inspired) ── */}
        <div style={{
          marginTop: isVertical ? '20px' : '10px',
          display: 'flex', gap: '8px',
        }}>
          {topic.dataHints.map((h) => (
            <div key={h.label} style={{
              flex: 1, padding: '10px 14px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <span style={{ fontSize: '8px', fontWeight: 600, color: '#475569', letterSpacing: '0.12em' }}>{h.label}</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: h.color, marginTop: '2px' }}>{h.value}</span>
            </div>
          ))}
        </div>

        {/* ── Insight Box ── */}
        <div style={{
          marginTop: isVertical ? '20px' : '10px',
          padding: isVertical ? '18px 22px' : '12px 18px',
          borderRadius: '12px',
          background: `${topic.color}06`, border: `1px solid ${topic.color}12`,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: topic.color, letterSpacing: '0.15em', marginBottom: '6px' }}>
            💡 KEY INSIGHT
          </div>
          <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5, margin: 0 }}>
            {topic.insight[lang] || topic.insight.en}
          </p>
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: isVertical ? '16px' : '10px', paddingTop: '10px',
          borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
        }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: topic.color }}>{seeMore}</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#06b6d4' }}>signumhq.com</span>
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
