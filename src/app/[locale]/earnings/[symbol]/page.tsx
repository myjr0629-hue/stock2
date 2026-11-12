// ============================================================================
// /[locale]/earnings/[symbol] — 종목별 «실적 예상 변동폭 vs 실제» 공개 페이지 (2026-11-12)
//   문구·판정은 lib/seo/earningsPage.ts, 읽기는 services/earningsPageService.ts(저장본만 · 공급사 호출 0).
//   데이터(예상 변동폭·채점)가 없으면 noindex,follow — 사이트맵도 같은 판정(indexableTickers)으로만 싣는다.
// ============================================================================
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { publicBase } from '@/lib/net/publicBase';
import { markPageView } from '@/lib/marketing/pageViewMark';
import { isFlowTicker } from '@/lib/seo/flowTicker';
import { FLOW_TICKERS } from '@/lib/seo/flowTickers';
import {
  EP_COPY, EP_LOCALES, actualText, buildEarningsPageView, earningsAppHref, earningsPath, expectedText,
  isEarningsPageTicker, longDate, md, nameWithTicker, toLoc, type EarningsPageView,
} from '@/lib/seo/earningsPage';
import { readEarningsPageSnapshot } from '@/services/earningsPageService';
import type { Loc } from '@/lib/earningsWeek';

// (layout 이 headers() 를 읽어 매 요청 동적 렌더다 — 신선도는 서비스의 5분 메모가 정한다)
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string; symbol: string }> };
const FLOW_SET = new Set<string>(FLOW_TICKERS);

async function load(props: Props): Promise<{ l: Loc; ticker: string; view: EarningsPageView; at: number }> {
  const { locale, symbol } = await props.params;
  const l = toLoc(locale);
  const raw = decodeURIComponent(String(symbol || ''));
  const ticker = raw.toUpperCase();
  if (!isEarningsPageTicker(ticker)) notFound();
  if (raw !== ticker) permanentRedirect(earningsPath(l, ticker));
  const nowMs = Date.now();
  const snap = await readEarningsPageSnapshot(nowMs);
  return { l, ticker, view: buildEarningsPageView(ticker, snap, nowMs), at: snap.at };
}

function metaParts(view: EarningsPageView, l: Loc) {
  const c = EP_COPY[l];
  const name = nameWithTicker(view.ticker, l);
  const pct = view.implied ? expectedText(view.implied.pct) : null;
  const upcoming = view.next && view.next.phase !== 'done' ? view.next : null;
  const est = upcoming && upcoming.dateStatus !== 'confirmed' ? c.estTag : '';
  const date = upcoming ? `${md(upcoming.date, l)}${est}` : null;
  const last = view.history[0] ?? null;
  return {
    title: c.metaTitle({ name, pct, date, graded: last ? md(last.date, l) : null }),
    description: c.metaDesc({ name, ticker: view.ticker, pct, date, last }),
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { l, ticker, view } = await load(props);
  const base = publicBase();
  const url = `${base}${earningsPath(l, ticker)}`;
  const { title, description } = metaParts(view, l);
  return {
    title, description,
    robots: view.indexable ? { index: true, follow: true } : { index: false, follow: true },
    alternates: {
      canonical: url,
      languages: { ...Object.fromEntries(EP_LOCALES.map((x) => [x, `${base}${earningsPath(x, ticker)}`])), 'x-default': `${base}${earningsPath('en', ticker)}` },
    },
    openGraph: { title, description, url, type: 'website', siteName: 'SIGNUM HQ' },
    twitter: { card: 'summary', title, description },
  };
}

const CSS = `
.ep{max-width:880px;margin:0 auto;padding:28px 16px 72px;font-family:Pretendard,system-ui,-apple-system,'Segoe UI',sans-serif;color:#17191E;background:#fff;line-height:1.6;overflow-wrap:anywhere}
.ep *{box-sizing:border-box}
.ep a{color:#075985}
.ep-kicker{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#C2410C}
.ep-h1{font-size:26px;line-height:1.28;font-weight:900;margin:6px 0 8px}
.ep-lead{font-size:15px;color:#55606B;margin:0 0 18px}
.ep-langs{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;margin:0 0 16px}
.ep-grid{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}
.ep-card{border:1px solid #E7E3DA;border-radius:14px;padding:14px 16px;background:#FAF8F3;min-width:0}
.ep-card h2{font-size:13px;font-weight:800;color:#55606B;margin:0 0 6px}
.ep-big{display:block;font-size:30px;line-height:1.15;font-weight:900;color:#C2410C;font-variant-numeric:tabular-nums}
.ep-date{display:block;font-size:18px;font-weight:900;line-height:1.35}
.ep-chip{display:inline-block;margin-top:6px;font-size:12px;font-weight:800;border-radius:999px;padding:2px 10px;border:1px solid #D9D4C8;color:#55606B;background:#fff}
.ep-chip.ok{border-color:#166534;color:#166534}
.ep-card p{margin:6px 0 0;font-size:14px;color:#3F4650}
.ep-card .ep-sub{font-size:12.5px;color:#7C848E}
.ep-cta{margin:20px 0 6px;background:#17191E;color:#fff;border-radius:14px;padding:14px}
.ep-cta a{display:flex;align-items:center;justify-content:center;min-height:48px;text-align:center;background:#C2410C;color:#fff;text-decoration:none;font-weight:900;font-size:15px;line-height:1.4;border-radius:12px;padding:12px 14px}
.ep-cta p{margin:8px 0 0;text-align:center;font-size:12px;color:#B5BCC6}
.ep-sec{margin-top:30px}
.ep-sec h2{font-size:18px;font-weight:900;margin:0 0 10px}
.ep-sum{font-size:14px;font-weight:700;margin:0 0 10px}
.ep-hist{list-style:none;margin:0;padding:0;border-top:1px solid #E7E3DA}
.ep-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px;padding:12px 2px;border-bottom:1px solid #EEE9E0}
.ep-row dt{font-size:11.5px;font-weight:700;color:#8A939E}
.ep-row dd{margin:0;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
.ep-row .ep-basis{grid-column:1/-1;font-size:12px;color:#7C848E;font-weight:400}
.ep-badge{display:inline-block;border:1px solid #64748b;border-radius:6px;padding:1px 8px;font-size:13px}
.ep-badge[data-range="within"]{color:#166534;border-color:#166534;background:#f0fdf4}
.ep-badge[data-range="outside"]{color:#9a3412;border-color:#9a3412;background:#fff7ed}
.ep-note{font-size:12.5px;color:#7C848E;margin:10px 0 0}
.ep-sec dl.ep-read{margin:0}
.ep-read dt{font-size:14px;font-weight:800;margin-top:10px}
.ep-read dd{margin:2px 0 0;font-size:14px;color:#55606B}
.ep-more{display:flex;flex-wrap:wrap;gap:8px}
.ep-more a{font-size:13.5px;font-weight:700;color:#17191E;text-decoration:none;border:1px solid #E7E3DA;border-radius:999px;padding:8px 12px;background:#fff;min-height:40px;display:inline-flex;align-items:center}
.ep-foot{font-size:12px;color:#9AA3AD;margin-top:26px;border-top:1px solid #EEE9E0;padding-top:14px}
.ep-foot p{margin:0 0 4px}
@media (min-width:760px){
  .ep{padding-top:36px}
  .ep-h1{font-size:34px}
  .ep-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ep-row{grid-template-columns:1.1fr 1fr 1fr 1fr}
}
`;

export default async function EarningsTickerPage(props: Props) {
  const { l, ticker, view, at } = await load(props);
  await markPageView('earnings_ticker', l);
  const c = EP_COPY[l];
  const base = publicBase();
  const name = nameWithTicker(ticker, l);
  const url = `${base}${earningsPath(l, ticker)}`;
  const { title, description } = metaParts(view, l);
  const next = view.next;
  const upcoming = next && next.phase !== 'done' ? next : null;
  const pct = view.implied ? expectedText(view.implied.pct) : null;
  const method = view.implied ? c.moveMethod[view.implied.basis] : null;
  const last = view.history[0] ?? null;
  const faq = c.faq({ name, ticker, calendarOk: view.calendarOk, recordsOk: view.recordsOk, packOk: view.packOk, nextDate: upcoming ? `${longDate(upcoming.date, l)}${upcoming.dateStatus !== 'confirmed' ? c.estTag : ''}` : null, pct, method, last });
  const beyond = view.history.filter((r) => r.beyond).length;
  const href = earningsAppHref(ticker, l);
  const hasFlow = isFlowTicker(ticker) && FLOW_SET.has(ticker);

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', '@id': `${url}#page`, name: title, description, url, inLanguage: l,
        isPartOf: { '@type': 'WebSite', name: 'SIGNUM HQ', url: base }, isAccessibleForFree: true,
        dateModified: new Date(at).toISOString(),
      },
      {
        '@type': 'FAQPage', '@id': `${url}#faq`, inLanguage: l,
        mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'SIGNUM HQ', item: `${base}/${l}` },
          { '@type': 'ListItem', position: 2, name: c.moreHub, item: `${base}${earningsPath(l)}` },
          { '@type': 'ListItem', position: 3, name, item: url },
        ],
      },
    ],
  };

  const cta = (
    <div className="ep-cta">
      <a href={href} rel="nofollow">{c.cta(name)} →</a>
      <p>{c.ctaSub}</p>
    </div>
  );

  return (
    <main className="ep" lang={l} data-ticker={ticker} data-indexable={view.indexable ? '1' : '0'}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <div className="ep-kicker">{c.kicker}</div>
      <h1 className="ep-h1">{c.h1(name)}</h1>
      <p className="ep-lead">{c.lead(name)}</p>
      <nav className="ep-langs" aria-label="language">
        {EP_LOCALES.map((x) => (
          <a key={x} href={earningsPath(x, ticker)} hrefLang={x} aria-current={x === l ? 'page' : undefined}>{{ ko: '한국어', en: 'English', ja: '日本語' }[x]}</a>
        ))}
      </nav>

      <div className="ep-grid">
        <section className="ep-card" aria-labelledby="ep-next" data-next={next?.date ?? ''}>
          <h2 id="ep-next">{c.nextT}</h2>
          {next ? (
            <>
              <span className="ep-date">{c.when({ date: next.date, hour: next.hour, etTime: next.etTime })}</span>
              <span className={`ep-chip${next.dateStatus === 'confirmed' ? ' ok' : ''}`}>{next.dateStatus === 'confirmed' ? c.statusConfirmed : c.statusEst}</span>
              {next.phase === 'done' && <p>{c.phaseDone}</p>}
            </>
          ) : <p>{view.calendarOk ? c.nextNone : c.nextUnknown}</p>}
        </section>
        <section className="ep-card" aria-labelledby="ep-move" data-implied={view.implied?.pct ?? ''}>
          <h2 id="ep-move">{c.moveT}</h2>
          {view.implied && pct ? (
            <>
              <span className="ep-big">{pct}</span>
              <p>{c.moveValue({ name, pct })}</p>
              <p className="ep-sub">{c.moveBasis(view.implied)}</p>
              <p className="ep-sub">{method}</p>
            </>
          ) : <p>{view.packOk ? c.moveNone : c.moveUnknown}</p>}
        </section>
      </div>

      {cta}

      <section className="ep-sec" aria-labelledby="ep-hist">
        <h2 id="ep-hist">{c.histT}</h2>
        {view.history.length ? (
          <>
            <p className="ep-sum">{c.histSummary({ n: view.history.length, beyond })}</p>
            <ul className="ep-hist">
              {view.history.map((r) => (
                <li key={r.date}>
                  <dl className="ep-row" data-date={r.date} data-expected={r.expectedPct} data-actual={r.actualPct}>
                    <div><dt>{c.col.date}</dt><dd>{longDate(r.date, l)}</dd></div>
                    <div><dt>{c.col.expected}</dt><dd>{expectedText(r.expectedPct)}</dd></div>
                    <div><dt>{c.col.actual}</dt><dd>{actualText(r.actualPct, r.expectedPct)}</dd></div>
                    <div><dt>{c.col.result}</dt><dd><span className="ep-badge" data-range={r.beyond ? 'outside' : 'within'}>{r.beyond ? c.outside : c.within}</span></dd></div>
                    <div className="ep-basis">{c.histBasis(r)}</div>
                  </dl>
                </li>
              ))}
            </ul>
            <p className="ep-note">{c.histHorizon}</p>
          </>
        ) : <p>{view.recordsOk ? c.histNone : c.histUnknown}</p>}
      </section>

      <section className="ep-sec" aria-labelledby="ep-read">
        <h2 id="ep-read">{c.readT}</h2>
        <dl className="ep-read">{c.read.map(([t, b]) => <div key={t}><dt>{t}</dt><dd>{b}</dd></div>)}</dl>
      </section>

      <section className="ep-sec" aria-labelledby="ep-faq">
        <h2 id="ep-faq">{c.faqT}</h2>
        <dl className="ep-read">{faq.map(([q, a]) => <div key={q}><dt>{q}</dt><dd>{a}</dd></div>)}</dl>
      </section>

      <section className="ep-sec" aria-labelledby="ep-more">
        <h2 id="ep-more">{c.moreT}</h2>
        <div className="ep-more">
          {hasFlow && <a href={`/${l}/flow/${ticker}`}>{c.moreFlow(ticker)}</a>}
          <a href={earningsPath(l)}>{c.moreHub}</a>
          <a href={`/${l}/earnings-week`}>{c.moreWeek}</a>
          <a href={`/${l}/receipts/earnings`}>{c.moreReceipts}</a>
          <a href={`/${l}/learn/earnings-expected-move`}>{c.moreLearn}</a>
        </div>
      </section>

      {cta}

      <footer className="ep-foot">
        <p>{c.asOf({ at: new Date(at).toISOString().slice(0, 16).replace('T', ' ') })}</p>
        <p>{c.disc}</p>
      </footer>
    </main>
  );
}
