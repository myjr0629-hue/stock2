'use client';

// ============================================================================
// BreakingCard — 가디언 OVERVIEW, 모닝브리프 «바로 아래» 급변동 속보 카드
// ----------------------------------------------------------------------------
// 정본: .agent/BREAKING_ALERT_PLAN.md §4-A
// 구조는 MorningBrief와 의도적으로 같다 — 접힌 카드 → 탭 → 전체화면 오버레이.
// 사용자가 이미 아는 동작이라 새로 배울 게 없다.
//
// 🚫 문구 규칙: 인과 단정 금지. "~로 인해" 없이 «같은 시간대»로만 잇는다.
//    (whyBuilder에서 이미 그렇게 조립되어 오지만, 여기 UI 라벨도 같은 규칙을 쓴다)
//
// 🅢 섀도 모드에서는 API가 빈 배열을 주므로 이 컴포넌트는 «아무것도 렌더하지 않는다».
//    자리도 차지하지 않는다 — 기존 화면에 영향 0.
// ============================================================================

import { useEffect, useState } from 'react';
import useSWR from 'swr';

type Loc = 'ko' | 'en' | 'ja';
const norm = (l: string): Loc => (l?.startsWith('ko') ? 'ko' : l?.startsWith('ja') ? 'ja' : 'en');
const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface NewsRef {
  headline: string; summary: string; source: string;
  publishedAtET: string; ageMinutes: number;
}
interface BreakingResp {
  items?: Array<{
    id: string; symbol: string; kind: 'SPIKE' | 'REVERSAL';
    changePct: number; priorPct: number | null; sigmaMult: number;
    volumeMult: number; dayChangePct: number; price: number; atET: string;
    headline: string; why: string;
    confidence: 'CORROBORATED' | 'SINGLE' | 'NONE';
    news: NewsRef[];
    calendar: Array<{ event: string; actual?: string; forecast?: string }>;
  }>;
}

const T: Record<Loc, Record<string, string>> = {
  ko: {
    badge: '속보', reversal: '반전', spike: '급변동',
    open: '전문 보기', close: '닫기',
    whatMoved: '무엇이 움직였나', sameWindow: '같은 시간대에 나온 것',
    ourData: '우리 데이터가 본 것',
    noNews: '뚜렷한 촉발 뉴스가 없습니다. 아래 수치가 대신 말합니다.',
    vol: '거래량', normal: '평소 대비', sigma: '평소 변동성 대비',
    day: '당일', minAgo: '분 전',
    corroborated: '복수 매체 확인', single: '단일 보도', none: '보도 없음',
    disclaimer: '정보 제공 목적입니다. 투자 자문이 아닙니다.',
    note: '위 사실들은 같은 시간대에 함께 관측된 것으로, 인과관계를 뜻하지 않습니다.',
  },
  en: {
    badge: 'BREAKING', reversal: 'REVERSAL', spike: 'SHARP MOVE',
    open: 'Read full', close: 'Close',
    whatMoved: 'What moved', sameWindow: 'Published in the same window',
    ourData: 'What our data saw',
    noNews: 'No clear news trigger. The numbers below stand in its place.',
    vol: 'Volume', normal: 'vs normal', sigma: 'vs typical volatility',
    day: 'Day', minAgo: 'min before',
    corroborated: 'Multiple outlets', single: 'Single report', none: 'No coverage',
    disclaimer: 'Informational only. Not investment advice.',
    note: 'These facts were observed in the same window. This does not imply causation.',
  },
  ja: {
    badge: '速報', reversal: '反転', spike: '急変動',
    open: '全文を見る', close: '閉じる',
    whatMoved: '何が動いたか', sameWindow: '同じ時間帯に出たもの',
    ourData: '当社データが捉えたもの',
    noNews: '明確なきっかけとなるニュースはありません。以下の数値が代わりに示します。',
    vol: '出来高', normal: '平常比', sigma: '平常変動比',
    day: '当日', minAgo: '分前',
    corroborated: '複数メディア確認', single: '単独報道', none: '報道なし',
    disclaimer: '情報提供目的です。投資助言ではありません。',
    note: '上記は同じ時間帯に観測された事実であり、因果関係を意味しません。',
  },
};

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

export function BreakingCard({ locale }: { locale: string }) {
  const loc = norm(locale);
  const t = T[loc];
  const [openId, setOpenId] = useState<string | null>(null);

  const { data } = useSWR<BreakingResp>(
    `/api/guardian/breaking?locale=${loc}`,
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 120_000, dedupingInterval: 30_000 },
  );

  const items = data?.items ?? [];
  const item = items.find((i) => i.id === openId) ?? null;

  useEffect(() => {
    if (!item) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [item]);

  // 섀도 모드 = 빈 배열 = 아무것도 렌더하지 않는다(자리도 안 차지).
  if (items.length === 0) return null;

  const top = items[0];
  const up = top.changePct >= 0;
  const accent = top.kind === 'REVERSAL' ? '#A78BFA' : up ? '#34D399' : '#FB7185';

  return (
    <>
      <button
        onClick={() => setOpenId(top.id)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          background: 'linear-gradient(180deg, rgba(20,26,38,0.96), rgba(13,17,26,0.96))',
          border: `1px solid ${accent}44`, borderRadius: 14, padding: '12px 14px',
          boxShadow: `0 0 22px ${accent}18`, appearance: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <span style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.09em',
            color: '#050810', background: accent, borderRadius: 999, padding: '3px 8px',
          }}>
            {t.badge}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: accent, letterSpacing: '0.06em' }}>
            {top.kind === 'REVERSAL' ? t.reversal : t.spike}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#7A879B', fontWeight: 700 }}>
            {top.atET} ET
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 5 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: '#EAF0F8', letterSpacing: '-0.01em' }}>
            {top.symbol}
          </span>
          <span style={{ fontSize: 19, fontWeight: 900, color: accent, letterSpacing: '-0.02em' }}>
            {pct(top.changePct)}
          </span>
          {top.kind === 'REVERSAL' && top.priorPct != null && (
            <span style={{ fontSize: 11.5, color: '#7A879B', fontWeight: 700 }}>
              ({pct(top.priorPct)} → {pct(top.changePct)})
            </span>
          )}
        </div>

        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#A9B6CA', fontWeight: 600 }}>
          {top.why}
        </div>

        <div style={{ marginTop: 9, fontSize: 11, fontWeight: 800, color: accent }}>
          {t.open} →
        </div>
      </button>

      {item && (
        <div
          onClick={() => setOpenId(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(4,7,13,0.97)',
            overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ padding: '52px 18px 44px', maxWidth: 620, margin: '0 auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{
                fontSize: 10, fontWeight: 900, letterSpacing: '0.09em',
                color: '#050810', background: accent, borderRadius: 999, padding: '3px 8px',
              }}>{t.badge}</span>
              <span style={{ fontSize: 11, color: '#7A879B', fontWeight: 700 }}>{item.atET} ET</span>
              <button
                onClick={() => setOpenId(null)}
                style={{
                  marginLeft: 'auto', appearance: 'none', background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)', color: '#C7D2E0',
                  borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 800,
                  cursor: 'pointer',
                }}
              >{t.close}</button>
            </div>

            {/* 무엇이 움직였나 */}
            <Section title={t.whatMoved} accent={accent}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: '#EAF0F8' }}>{item.symbol}</span>
                <span style={{ fontSize: 30, fontWeight: 900, color: accent, letterSpacing: '-0.03em' }}>
                  {pct(item.changePct)}
                </span>
                <span style={{ fontSize: 12, color: '#7A879B', fontWeight: 700 }}>
                  30min · {t.day} {pct(item.dayChangePct)}
                </span>
              </div>
              {item.kind === 'REVERSAL' && item.priorPct != null && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#A9B6CA', fontWeight: 700 }}>
                  {pct(item.priorPct)} → {pct(item.changePct)}
                </div>
              )}
            </Section>

            {/* 같은 시간대 */}
            <Section
              title={t.sameWindow}
              accent={accent}
              tag={item.confidence === 'CORROBORATED' ? t.corroborated
                : item.confidence === 'SINGLE' ? t.single : t.none}
            >
              {item.news.length === 0 && item.calendar.length === 0 && (
                <div style={{ fontSize: 13, color: '#8C99AD', lineHeight: 1.6, fontWeight: 600 }}>
                  {t.noNews}
                </div>
              )}
              {item.calendar.map((c, i) => (
                <div key={`c${i}`} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13.5, color: '#DCE5F0', fontWeight: 800 }}>{c.event}</div>
                  {(c.actual || c.forecast) && (
                    <div style={{ fontSize: 11.5, color: '#7A879B', fontWeight: 700, marginTop: 2 }}>
                      {c.actual ?? '—'} / {c.forecast ?? '—'}
                    </div>
                  )}
                </div>
              ))}
              {item.news.map((n, i) => (
                <div key={`n${i}`} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13.5, color: '#DCE5F0', fontWeight: 800, lineHeight: 1.45 }}>
                    {n.headline}
                  </div>
                  {n.summary && (
                    <div style={{ fontSize: 12.5, color: '#94A2B6', lineHeight: 1.55, marginTop: 4, fontWeight: 600 }}>
                      {n.summary}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: '#69768A', fontWeight: 700, marginTop: 4 }}>
                    {n.source} · {n.ageMinutes}{t.minAgo}
                  </div>
                </div>
              ))}
            </Section>

            {/* 우리 데이터 */}
            <Section title={t.ourData} accent={accent}>
              <Metric label={t.sigma} value={`${item.sigmaMult.toFixed(1)}σ`} accent={accent} />
              <Metric label={`${t.vol} ${t.normal}`} value={`${item.volumeMult.toFixed(1)}x`} accent={accent} />
            </Section>

            <div style={{
              marginTop: 22, fontSize: 11, lineHeight: 1.6, color: '#69768A', fontWeight: 600,
            }}>
              {t.note}
            </div>
            <div style={{
              marginTop: 8, fontSize: 11, color: '#5A6577', fontWeight: 700,
            }}>
              {t.disclaimer}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, accent, tag, children }: {
  title: string; accent: string; tag?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 3, height: 13, background: accent, borderRadius: 2 }} />
        <span style={{ fontSize: 11, fontWeight: 900, color: '#8C99AD', letterSpacing: '0.08em' }}>
          {title.toUpperCase()}
        </span>
        {tag && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: accent,
            border: `1px solid ${accent}44`, borderRadius: 999, padding: '2px 8px',
          }}>{tag}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <span style={{ fontSize: 12.5, color: '#8C99AD', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 15, color: accent, fontWeight: 900 }}>{value}</span>
    </div>
  );
}
