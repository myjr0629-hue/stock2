import type { Metadata } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import { EW_LOCALES, toLoc } from '@/lib/earningsWeek';
import { expectedPctText } from '@/lib/earnings/earningsActuals';
import { receiptWeeks, resolveReceiptWeek } from '@/lib/earnings/earningsReceipts';
import { RECEIPT_COPY } from '@/lib/earnings/earningsReceiptsCopy';
import { readEarningsReceipts } from '@/services/earningsReceiptsService';
import { ShareLanding } from '@/components/share/ShareLanding';

export const dynamic = 'force-dynamic';
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
};
const path = (l: string, week: string) => `/${l}/receipts/earnings?week=${week}`;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const l = toLoc((await params).locale);
  const week = resolveReceiptWeek((await searchParams).week);
  const c = RECEIPT_COPY[l];
  const base = publicBase();
  const url = `${base}${path(l, week)}`;
  const image = `${base}/${l}/receipts/earnings/og?week=${week}`;
  const title = `${c.title} · ${week}`;
  return {
    title, description: c.description, robots: { index: true, follow: true },
    alternates: { canonical: url, languages: {
      ...Object.fromEntries(EW_LOCALES.map((loc) => [loc, `${base}${path(loc, week)}`])),
      'x-default': `${base}${path('en', week)}`,
    } },
    openGraph: { title, description: c.description, url, type: 'website', siteName: 'SIGNUM HQ',
      images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: 'summary_large_image', title, description: c.description, images: [image] },
  };
}

const CSS = `
.er{width:100%;max-width:1180px;margin:0 auto;padding:32px 16px 80px;color:#17191e;background:#fff;line-height:1.65;overflow-wrap:anywhere}
.er *{box-sizing:border-box}.er h1{font-size:28px;line-height:1.3;font-weight:800;margin:8px 0}.er h2{font-size:20px;font-weight:800;margin:28px 0 12px}
.er p{margin:10px 0}.er a{color:#075985;text-decoration:underline}.er nav,.er form{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:16px 0}
.er select,.er button{border:1px solid #94a3b8;border-radius:8px;padding:8px 12px;background:#fff;color:#17191e;font:inherit;min-height:44px}.er button{cursor:pointer}
.er-scroll{overflow-x:auto}.er table{width:100%;min-width:920px;border-collapse:collapse;text-align:left;font-size:14px}.er caption{text-align:left;padding:12px 0;font-weight:700}
.er th,.er td{padding:14px 12px;border-bottom:1px solid #cbd5e1;vertical-align:top}.er th{background:#f1f5f9}.er td small{display:block;font-size:12px;color:#475569;margin-top:5px}
.er td strong{display:block;font-weight:800}.er .er-status{border-left:3px solid #64748b;padding-left:8px}.er .er-reason{margin-top:8px;color:#78350f}.er .er-empty{padding:20px;border:1px solid #cbd5e1;border-radius:8px}
.er li{margin:10px 0}.er ul{padding-left:20px}.er footer{margin-top:32px}.er .er-meta{font-size:12px;color:#475569}
`;
const iso = (ms: number) => new Date(ms).toISOString();
const usd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
// 경계 바로 밖의 3.0001%가 +3.0%로 보이는 반올림 착시를 피한다.
const actualPct = (n: number) => `${n === 0 ? '' : n < 0 ? '−' : '+'}${Math.abs(n).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0')}%`;

export default async function EarningsReceiptsPage({ params, searchParams }: Props) {
  const l = toLoc((await params).locale);
  const week = resolveReceiptWeek((await searchParams).week);
  const c = RECEIPT_COPY[l];
  const data = await readEarningsReceipts(week);
  return (
    <main className="er" lang={l}>
      <style>{CSS}</style>
      <p>SIGNUM HQ</p>
      <h1>{c.title}</h1>
      <p>{c.description}</p>
      <nav aria-label={c.languages}>
        {EW_LOCALES.map((loc) => <a key={loc} href={path(loc, week)} hrefLang={loc} aria-current={loc === l ? 'page' : undefined}>
          {{ ko: '한국어', en: 'English', ja: '日本語' }[loc]}
        </a>)}
      </nav>
      <form action={`/${l}/receipts/earnings`} method="get">
        <label htmlFor="receipt-week">{c.week}</label>
        <select id="receipt-week" name="week" defaultValue={week}>
          {receiptWeeks(week).map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
        <button type="submit">{c.show}</button>
      </form>
      <p className="er-meta">{week} — {data.weekEnd} · ET · {data.asOf} (UTC)</p>
      <p>{c.summary(data.summary)}</p>
      {data.emptyReason ? <p className="er-empty">{c.noRecord} ({c.issues[data.emptyReason]})</p> : (
        <div className="er-scroll" role="region" aria-label={c.title} tabIndex={0}>
          <table>
            <caption>{week} — {data.weekEnd} · {c.title}</caption>
            <thead><tr>{c.columns.map((col) => <th scope="col" key={col}>{col}</th>)}</tr></thead>
            <tbody>{data.rows.map((r) => (
              <tr key={`${r.ticker}-${r.date}`} data-provenance={r.provenance}>
                <td>
                  <strong><a href={`/${l}/flow/${encodeURIComponent(r.ticker)}`}>{r.ticker}</a></strong>
                  <span>{r.date}</span>
                  <small>{r.etTime ? `${r.etTime} ET` : c.hour[r.hour]}</small>
                  <small><a href={r.sourceUrl} rel="noopener noreferrer">{c.source}</a></small>
                </td>
                <td>{r.expected ? <>
                  <strong>{expectedPctText(r.expected.pct)}</strong>
                  <small>{c.session}: {r.expected.session}</small>
                  <small>{c.expiry}: {r.expected.expiry}</small>
                  <small>{c.captured}: <time dateTime={iso(r.expected.capturedAt)}>{iso(r.expected.capturedAt)}</time></small>
                  <small>{r.expected.src}</small>
                </> : <span>{c.noRecord} ({c.issues[r.issues.find((x) => x.includes('expected')) ?? r.issues[0]]})</span>}</td>
                <td>{r.actual ? <>
                  <strong>{actualPct(r.actual.pct)}</strong>
                  <small>{c.price}: {r.actual.baseDate} ${usd(r.actual.baseClose)} → {r.actual.reactDate} ${usd(r.actual.reactClose)}</small>
                  <small>{c.calculated}: <time dateTime={iso(r.actual.at)}>{iso(r.actual.at)}</time></small>
                  <small>{r.actual.check === 'fmp' ? c.fmp : c.single}</small>
                </> : <span>{c.noRecord} ({c.issues[r.issues.find((x) => x.includes('actual')) ?? r.issues[0]]})</span>}</td>
                <td><strong>{r.beyond == null ? c.notCompared : r.beyond ? c.outside : c.within}</strong>
                  {r.beyond != null && r.provenance !== 'pre' && <small>{c.provisional}</small>}
                </td>
                <td>
                  <strong className="er-status">{c.provenance[r.provenance]}</strong>
                  {r.issues.map((issue) => <p className="er-reason" key={issue}>{c.noRecord} ({c.issues[issue]})</p>)}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <section aria-labelledby="receipt-method">
        <h2 id="receipt-method">{c.method}</h2>
        <ul>{c.methods.map((m) => <li key={m}>{m}</li>)}</ul>
      </section>
      <footer>
        <ShareLanding app="signum" locale={l} variant="card" from="receipts" />
      </footer>
    </main>
  );
}
