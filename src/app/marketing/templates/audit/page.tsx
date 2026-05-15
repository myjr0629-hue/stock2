'use client';

// ============================================================================
// OG Image Audit Dashboard — 사이즈/용도별 분류, 레거시 분리
// ============================================================================

interface Template {
  id: number;
  name: string;
  route: string;
  internalSize: string;
  sampleParams: string;
  usedBy: string;
  hasPinLayout: boolean;
}

interface Section {
  title: string;
  emoji: string;
  color: string;
  borderColor: string;
  bgColor: string;
  desc: string;
  templates: Template[];
}

const SECTIONS: Section[] = [
  // ── 1. Tweet/OG — 가로형 (X, Bluesky, Threads, Telegram) ──
  {
    title: 'Tweet / OG — 가로형',
    emoji: '🖼️',
    color: '#60a5fa',
    borderColor: '#1e3a5f',
    bgColor: '#0a1628',
    desc: '1200×675 (16:9) | X, Bluesky, Threads, Telegram 피드 이미지',
    templates: [
      { id: 1,  name: 'pulse',        route: '/templates/og/pulse',        internalSize: '1200×675',  sampleParams: '?spy=0.77&vix=17.3&gex=positive&dp=42.1',                   usedBy: 'morning, pulse, close → X/Bluesky/Threads',   hasPinLayout: false },
      { id: 2,  name: 'morning',      route: '/templates/og/morning',      internalSize: '동적',       sampleParams: '?spy=0.5&vix=17.3&gex=positive&dp=42.1',                    usedBy: 'morning → X/Bluesky/Threads',                  hasPinLayout: true  },
      { id: 3,  name: 'market-close', route: '/templates/og/market-close', internalSize: '1200×675',  sampleParams: '?spy=-0.32&vix=18.7&gex=negative&dp=38.5&date=2026-05-15', usedBy: 'market_close_asia → X/Bluesky/Threads',        hasPinLayout: false },
      { id: 4,  name: 'spotlight',    route: '/templates/og/spotlight',    internalSize: '1200×675',  sampleParams: '?t=NVDA&dp=45.2&whale=62&gex=positive&price=135.40&change=2.37', usedBy: 'spotlight → X/Bluesky/Threads',                hasPinLayout: false },
      { id: 5,  name: 'spacex-ipo',   route: '/templates/og/spacex-ipo',   internalSize: '1200×675',  sampleParams: '?dp=41.5&whale=65&gex=positive&price=285.50&change=1.23',   usedBy: 'spacex → X/Bluesky/Threads',                   hasPinLayout: true  },
      { id: 6,  name: 'education',    route: '/templates/og/education',    internalSize: '동적',       sampleParams: '?topic=gex',                                                usedBy: 'education → X/Bluesky/Threads',                hasPinLayout: false },
      { id: 7,  name: 'event',        route: '/templates/og/event',        internalSize: '동적',       sampleParams: '?type=gex_shift&ticker=SPY&event=GEX+Flip+Negative',        usedBy: 'event-detect → X/Bluesky/Threads',             hasPinLayout: false },
    ],
  },

  // ── 2. Pinterest Pin — 세로형 ──
  {
    title: 'Pinterest Pin — 세로형',
    emoji: '📌',
    color: '#34d399',
    borderColor: '#065f46',
    bgColor: '#041f18',
    desc: '1000×1500 (2:3) | Pinterest 전용 세로 레이아웃',
    templates: [
      { id: 9,  name: 'education-pin',        route: '/templates/og/education-pin',      internalSize: '1000×1500', sampleParams: '?topic=gex',                                              usedBy: 'education → Pinterest Pin',                    hasPinLayout: true  },
      { id: 10, name: 'spacex-ipo (pin)',      route: '/templates/og/spacex-ipo',         internalSize: '1000×1500', sampleParams: '?dp=41.5&whale=65&gex=positive&price=285.50&format=pin',   usedBy: 'spacex → Pinterest Pin',                       hasPinLayout: true  },
      { id: 11, name: 'morning-pin',          route: '/templates/og/morning-pin',     internalSize: '1000×1500', sampleParams: '?spy=0.84&vix=18.2&gex=positive&dp=39.2&date=May+16%2C+2026', usedBy: 'morning → Pinterest Pin (Sunrise Dashboard)',  hasPinLayout: true  },
      { id: 15, name: 'market-close-pin',      route: '/templates/og/market-close-pin',   internalSize: '1000×1500', sampleParams: '?spy=0.84&qqq=1.71&dia=0.32&vix=18.2&dp=39.2&gex=positive&fgi=62&date=2026-05-15', usedBy: 'market_close → Pinterest Pin (Full Dashboard)', hasPinLayout: true  },
      { id: 20, name: 'pulse-pin',             route: '/templates/og/pulse-pin',          internalSize: '1000×1500', sampleParams: '?spy=0.84&vix=18.2&gex=positive&dp=39.2&fgi=62&date=2026-05-15', usedBy: 'pulse → Pinterest Pin (Market Pulse Dashboard)', hasPinLayout: true  },
    ],
  },

  // ── 3. IG Carousel / Single — 정사각형 ──
  {
    title: 'IG Feed — 정사각형',
    emoji: '🔲',
    color: '#f472b6',
    borderColor: '#831843',
    bgColor: '#1a0a18',
    desc: '1080×1080 (1:1) | Instagram Feed 캐러셀 + 싱글이미지',
    templates: [
      { id: 12, name: 'carousel',           route: '/templates/og/carousel',           internalSize: '1080×1080', sampleParams: '?spy=0.5&qqq=0.8&vix=17.3&gex=positive&dp=42.1&slide=1', usedBy: 'morning/pulse → IG Carousel (6 slides)',      hasPinLayout: false },
      { id: 13, name: 'market-close-ig',    route: '/templates/og/market-close-ig',    internalSize: '1080×1080', sampleParams: '?spy=-0.32&vix=18.7&gex=negative&dp=38.5&slide=1',       usedBy: 'market_close_asia → IG Carousel',             hasPinLayout: false },
      { id: 14, name: 'education-carousel', route: '/templates/og/education-carousel', internalSize: '1080×1080', sampleParams: '?topic=gex&slide=1',                                     usedBy: 'education → IG Carousel (5 slides)',          hasPinLayout: false },
      { id: 16, name: 'morning-ig',         route: '/templates/og/morning-ig',         internalSize: '1080×1080', sampleParams: '?spy=0.84&vix=18.2&gex=positive&dp=39.2&date=2026-05-15', usedBy: 'morning → IG Single Image',                   hasPinLayout: false },
    ],
  },

  // ── 4. IG Story — 세로 풀스크린 ──
  {
    title: 'IG Story — 세로 풀스크린',
    emoji: '📱',
    color: '#c084fc',
    borderColor: '#581c87',
    bgColor: '#140a28',
    desc: '1080×1920 (9:16) | Instagram Story 전용',
    templates: [
      { id: 15, name: 'story (pulse)',      route: '/marketing/templates/story',               internalSize: '1080×1920', sampleParams: '?spy=0.5&vix=17.3&gex=positive&dp=42.1',  usedBy: 'pulse/morning → IG Story',     hasPinLayout: false },
      { id: 16, name: 'story/morning',      route: '/marketing/templates/story/morning',       internalSize: '1080×1920', sampleParams: '?spy=0.5&vix=17.3&gex=positive&dp=42.1',  usedBy: 'morning → IG Story',           hasPinLayout: false },
      { id: 17, name: 'story/education',    route: '/marketing/templates/story/education',     internalSize: '1080×1920', sampleParams: '?topic=gex',                              usedBy: 'education → IG Story',         hasPinLayout: false },
      { id: 18, name: 'story/event',        route: '/marketing/templates/story/event',         internalSize: '1080×1920', sampleParams: '?type=gex_shift&ticker=SPY&event=GEX+Flip',usedBy: 'event → IG Story',            hasPinLayout: false },
      { id: 19, name: 'story/spotlight',    route: '/marketing/templates/story/spotlight',     internalSize: '1080×1920', sampleParams: '?ticker=NVDA&dp=45&smartFlow=62',         usedBy: 'spotlight → IG Story',         hasPinLayout: false },
    ],
  },
];

export default function OGAuditPage() {
  return (
    <div style={{ background: '#06080e', color: '#e0e0e0', minHeight: '100vh', padding: '24px 20px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#fff', marginBottom: '4px', letterSpacing: '-0.02em' }}>
          📊 OG Image Audit — 전체 {SECTIONS.reduce((a, s) => a + s.templates.length, 0)}개 템플릿
        </h1>
        <p style={{ color: '#666', fontSize: '13px', marginBottom: '24px' }}>
          사이즈/용도별 분류. 각 템플릿의 내부 사이즈, 사용처, 실시간 미리보기. Pin 전용 레이아웃은 📌 표시.
        </p>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', flexWrap: 'wrap' }}>
          {SECTIONS.map(s => (
            <div key={s.title} style={{
              padding: '8px 16px', borderRadius: '8px',
              border: `1px solid ${s.borderColor}`, background: s.bgColor,
              fontSize: '13px', color: s.color,
            }}>
              {s.emoji} {s.title.split('—')[0].trim()} <strong>({s.templates.length})</strong>
            </div>
          ))}
        </div>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: '36px' }}>
            {/* Section header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              marginBottom: '6px', paddingBottom: '8px',
              borderBottom: `2px solid ${section.borderColor}`,
            }}>
              <span style={{ fontSize: '22px' }}>{section.emoji}</span>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: section.color, margin: 0 }}>
                {section.title}
              </h2>
              <span style={{ fontSize: '12px', color: '#666', marginLeft: 'auto' }}>{section.desc}</span>
            </div>

            {/* Template grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: section.title.includes('Story')
                ? 'repeat(auto-fill, minmax(200px, 1fr))'
                : 'repeat(auto-fill, minmax(380px, 1fr))',
              gap: '12px',
            }}>
              {section.templates.map((t) => {
                const isStory = section.title.includes('Story');
                const isPin = section.title.includes('Pin');
                const isCarousel = section.title.includes('Carousel');
                const previewUrl = `${t.route}${t.sampleParams}`;

                // 실제 템플릿 사이즈
                let iframeW = 1200, iframeH = 675;
                if (isStory) { iframeW = 1080; iframeH = 1920; }
                else if (isPin) { iframeW = 1000; iframeH = 1500; }
                else if (isCarousel) { iframeW = 1080; iframeH = 1080; }

                // 카드 내부 약 356px 기준 스케일
                const scale = 356 / iframeW;

                return (
                  <div
                    key={`${section.title}-${t.id}`}
                    style={{
                      background: section.bgColor,
                      border: `1px solid ${section.borderColor}`,
                      borderRadius: '10px',
                      padding: '12px',
                    }}
                  >
                    {/* Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <span style={{
                        background: `${section.color}20`,
                        color: section.color,
                        padding: '1px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                      }}>
                        #{t.id}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff', flex: 1 }}>{t.name}</span>
                      <span style={{ fontSize: '10px', color: '#555' }}>{t.internalSize}</span>
                      {t.hasPinLayout && (
                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: '#064e3b', color: '#34d399', border: '1px solid #065f46' }}>
                          📌
                        </span>
                      )}
                    </div>

                    {/* Route + used by */}
                    <code style={{ color: '#6366f1', fontSize: '10px', display: 'block', marginBottom: '2px' }}>{t.route}</code>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px' }}>{t.usedBy}</div>

                    {/* Preview — 실제 비율 + 사이즈 프레임 표시 */}
                    <div style={{
                      position: 'relative', width: '100%',
                      borderRadius: '6px', border: `2px dashed ${section.color}44`, background: '#000',
                    }}>
                      {/* 사이즈 레이블 */}
                      <div style={{
                        position: 'absolute', top: '-18px', right: '0',
                        fontSize: '9px', color: section.color, fontWeight: 700, letterSpacing: '0.05em',
                        zIndex: 5, background: section.bgColor, padding: '0 4px',
                      }}>
                        {iframeW}×{iframeH}px
                      </div>
                      <div style={{
                        position: 'relative', width: '100%',
                        paddingBottom: `${(iframeH / iframeW * 100).toFixed(2)}%`,
                        overflow: 'hidden', borderRadius: '4px',
                      }}>
                        <iframe
                          src={previewUrl}
                          style={{
                            position: 'absolute', top: 0, left: 0,
                            width: `${iframeW}px`, height: `${iframeH}px`,
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left',
                            border: 'none', pointerEvents: 'none',
                          }}
                          loading="lazy"
                        />
                      </div>
                    </div>

                    {/* Link */}
                    <a href={previewUrl} target="_blank" rel="noopener"
                      style={{ fontSize: '10px', color: section.color, display: 'block', marginTop: '6px' }}>
                      원본 보기 →
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Summary */}
        <div style={{ padding: '16px', background: '#0a0e18', borderRadius: '10px', border: '1px solid #1e293b' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '10px' }}>요약</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead><tr style={{ borderBottom: '1px solid #1e293b' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b' }}>분류</th>
              <th style={{ textAlign: 'center', padding: '6px 8px', color: '#64748b' }}>수</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b' }}>사이즈</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b' }}>플랫폼</th>
            </tr></thead>
            <tbody>
              {SECTIONS.map(s => (
                <tr key={s.title} style={{ borderBottom: '1px solid #111' }}>
                  <td style={{ padding: '6px 8px', color: s.color }}>{s.emoji} {s.title.split('—')[0].trim()}</td>
                  <td style={{ textAlign: 'center', color: s.color, fontWeight: 700 }}>{s.templates.length}</td>
                  <td style={{ padding: '6px 8px', color: '#888' }}>{s.desc.split('|')[0].trim()}</td>
                  <td style={{ padding: '6px 8px', color: '#888' }}>{s.desc.split('|')[1]?.trim() || '-'}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #1e293b' }}>
                <td style={{ padding: '6px 8px', color: '#fff', fontWeight: 700 }}>합계</td>
                <td style={{ textAlign: 'center', color: '#fff', fontWeight: 700 }}>{SECTIONS.reduce((a, s) => a + s.templates.length, 0)}</td>
                <td colSpan={2} style={{ padding: '6px 8px', color: '#888' }}>
                  활성 {SECTIONS.slice(0, 4).reduce((a, s) => a + s.templates.length, 0)} + 레거시 {SECTIONS[4]?.templates.length || 0}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
