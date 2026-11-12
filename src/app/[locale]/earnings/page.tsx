// ============================================================================
// /[locale]/earnings — 종목별 실적 채점표 허브 (2026-11-12)
//   다가오는 발표(옵션 예상 변동폭) · 최근 채점(예상 vs 실제) · 전체 종목 → /[locale]/earnings/[symbol] 로 내부 링크.
//   읽기는 services/earningsPageService.ts 한 벌(저장본만 · 공급사 호출 0).
// ============================================================================
import type { Metadata } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import {
  EARNINGS_PAGE_TICKERS, EP_COPY, EP_LOCALES, actualText, buildEarningsPageView, earningsPath, expectedText,
  md, nameWithTicker, toLoc,
} from '@/lib/seo/earningsPage';
import { readEarningsPageSnapshot } from '@/services/earningsPageService';
import type { ScorecardRow } from '@/lib/earnings/earningsScorecard';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string }> };

async function load(locale: string) {
  const nowMs = Date.now();
  const snap = await readEarningsPageSnapshot(nowMs);
  const views = EARNINGS_PAGE_TICKERS.map((t) => buildEarningsPageView(t, snap, nowMs));
  const upcoming = views.filter((v) => v.implied && v.next && v.next.phase !== 'done')
    .sort((a, b) => a.next!.date.localeCompare(b.next!.date) || b.implied!.pct - a.implied!.pct || a.ticker.localeCompare(b.ticker));
  const graded: ScorecardRow[] = views.flatMap((v) => v.history)
    .sort((a, b) => b.date.localeCompare(a.date) || a.ticker.localeCompare(b.ticker)).slice(0, 60);
  return { l: toLoc(locale), snap, views, upcoming, graded };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { l, views } = await load((await params).locale);
  const c = EP_COPY[l];
  const base = publicBase();
  const url = `${base}${earningsPath(l)}`;
  const any = views.some((v) => v.indexable);
  return {
    title: c.hubTitle, description: c.hubMetaDesc,
    robots: any ? { index: true, follow: true } : { index: false, follow: true },
    alternates: {
      canonical: url,
      languages: { ...Object.fromEntries(EP_LOCALES.map((x) => [x, `${base}${earningsPath(x)}`])), 'x-default': `${base}${earningsPath('en')}` },
    },
    openGraph: { title: c.hubTitle, description: c.hubMetaDesc, url, type: 'website', siteName: 'SIGNUM HQ' },
    twitter: { card: 'summary', title: c.hubTitle, description: c.hubMetaDesc },
  };
}

const CSS = `
.eh{max-width:960px;margin:0 auto;padding:28px 16px 72px;font-family:Pretendard,system-ui,-apple-system,'Segoe UI',sans-serif;color:#17191E;background:#fff;line-height:1.6;overflow-wrap:anywhere}
.eh *{box-sizing:border-box}
.eh-kicker{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#C2410C}
.eh h1{font-size:26px;line-height:1.28;font-weight:900;margin:6px 0 8px}
.eh-lead{font-size:15px;color:#55606B;margin:0 0 16px}
.eh-langs{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;margin:0 0 8px}
.eh-langs a{color:#075985}
.eh h2{font-size:18px;font-weight:900;margin:28px 0 10px}
.eh-list{list-style:none;margin:0;padding:0;border-top:1px solid #E7E3DA}
.eh-list li{border-bottom:1px solid #EEE9E0}
.eh-list a{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:12px 2px;color:#17191E;text-decoration:none;min-height:48px}
.eh-list b{font-size:16px;font-weight:900}
.eh-list .n{font-size:12.5px;color:#7C848E;grid-column:1}
.eh-list .v{grid-column:2;grid-row:1/3;align-self:center;text-align:right;font-weight:900;font-variant-numeric:tabular-nums;color:#C2410C;font-size:17px}
.eh-list .v small{display:block;font-size:12px;font-weight:700;color:#55606B}
.eh-list .v[data-range="outside"] small{color:#9a3412}
.eh-list .v[data-range="within"] small{color:#166534}
.eh-all{display:flex;flex-wrap:wrap;gap:8px}
.eh-all a{font-size:13px;font-weight:700;color:#17191E;text-decoration:none;border:1px solid #E7E3DA;border-radius:999px;padding:6px 11px;background:#fff;min-height:36px;display:inline-flex;align-items:center}
.eh-empty{font-size:14px;color:#55606B}
.eh-cta{margin:24px 0 6px;background:#17191E;border-radius:14px;padding:14px}
.eh-cta a{display:flex;align-items:center;justify-content:center;min-height:48px;text-align:center;background:#C2410C;color:#fff;text-decoration:none;font-weight:900;font-size:15px;border-radius:12px;padding:12px 14px}
.eh-cta p{margin:8px 0 0;text-align:center;font-size:12px;color:#B5BCC6}
.eh-more{display:flex;flex-wrap:wrap;gap:8px}
.eh-more a{font-size:13.5px;font-weight:700;color:#17191E;text-decoration:none;border:1px solid #E7E3DA;border-radius:999px;padding:8px 12px;background:#fff}
.eh-foot{font-size:12px;color:#9AA3AD;margin-top:26px;border-top:1px solid #EEE9E0;padding-top:14px}
@media (min-width:760px){.eh h1{font-size:34px}}
`;

export default async function EarningsHubPage({ params }: Props) {
  const { l, snap, upcoming, graded } = await load((await params).locale);
  const c = EP_COPY[l];
  const base = publicBase();
  const url = `${base}${earningsPath(l)}`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.hubTitle, description: c.hubMetaDesc, url, inLanguage: l,
    isPartOf: { '@type': 'WebSite', name: 'SIGNUM HQ', url: base }, isAccessibleForFree: true,
    dateModified: new Date(snap.at).toISOString(),
  };
  return (
    <main className="eh" lang={l}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <div className="eh-kicker">{c.kicker}</div>
      <h1>{c.hubH1}</h1>
      <p className="eh-lead">{c.hubLead}</p>
      <nav className="eh-langs" aria-label="language">
        {EP_LOCALES.map((x) => <a key={x} href={earningsPath(x)} hrefLang={x} aria-current={x === l ? 'page' : undefined}>{{ ko: '한국어', en: 'English', ja: '日本語' }[x]}</a>)}
      </nav>

      <h2>{c.hubUpcomingT}</h2>
      {upcoming.length ? (
        <ul className="eh-list">
          {upcoming.map((v) => (
            <li key={v.ticker}><a href={earningsPath(l, v.ticker)}>
              <b>{v.ticker}</b>
              <span className="n">{nameWithTicker(v.ticker, l) === v.ticker ? '' : `${nameWithTicker(v.ticker, l)} · `}{md(v.next!.date, l)}</span>
              <span className="v">{expectedText(v.implied!.pct)}</span>
            </a></li>
          ))}
        </ul>
      ) : <p className="eh-empty">{!snap.calendarOk ? c.nextUnknown : snap.packAt == null ? c.moveUnknown : c.hubEmpty}</p>}

      <h2>{c.hubGradedT}</h2>
      {graded.length ? (
        <ul className="eh-list">
          {graded.map((r) => (
            <li key={`${r.ticker}-${r.date}`}><a href={earningsPath(l, r.ticker)}>
              <b>{r.ticker}</b>
              <span className="n">{md(r.date, l)} · {c.col.expected} {expectedText(r.expectedPct)}</span>
              <span className="v" data-range={r.beyond ? 'outside' : 'within'}>{actualText(r.actualPct, r.expectedPct)}<small>{r.beyond ? c.outside : c.within}</small></span>
            </a></li>
          ))}
        </ul>
      ) : <p className="eh-empty">{snap.recordsOk ? c.hubEmpty : c.histUnknown}</p>}

      <h2>{c.hubAllT}</h2>
      <div className="eh-all">
        {EARNINGS_PAGE_TICKERS.map((t) => <a key={t} href={earningsPath(l, t)}>{t}</a>)}
      </div>

      <div className="eh-cta">
        <a href={`/app?from=seo_earnings&l=${l}`} rel="nofollow">{c.hubCta} →</a>
        <p>{c.ctaSub}</p>
      </div>

      <h2>{c.moreT}</h2>
      <div className="eh-more">
        <a href={`/${l}/earnings-week`}>{c.moreWeek}</a>
        <a href={`/${l}/receipts/earnings`}>{c.moreReceipts}</a>
        <a href={`/${l}/learn/earnings-expected-move`}>{c.moreLearn}</a>
      </div>

      <footer className="eh-foot"><p>{c.disc}</p></footer>
    </main>
  );
}
