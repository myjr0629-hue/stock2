import type { Metadata } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import { EW_LOCALES, toLoc } from '@/lib/earningsWeek';
import { READ_COPY, evidence } from '@/lib/readCheck/copy';
import { KINDS, READ_CHECK_TICKERS, judge, parseChoice, parseTicker, selectCases, usable } from '@/lib/readCheck/rules';
import { readCheckSnapshot } from '@/services/readCheckService';

export const dynamic = 'force-dynamic';
type Query = { t?: string | string[]; options?: string | string[]; darkPool?: string | string[]; insider?: string | string[] };
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Query> };
const path = (l: string) => `/${l}/tools/read-check`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = toLoc((await params).locale), c = READ_COPY[l], base = publicBase();
  const url = `${base}${path(l)}`, image = `${url}/og`;
  return { title: c.title, description: c.description, robots: { index: true, follow: true },
    alternates: { canonical: url, languages: { ...Object.fromEntries(EW_LOCALES.map(loc => [loc, `${base}${path(loc)}`])), 'x-default': `${base}${path('en')}` } },
    openGraph: { title: c.title, description: c.description, url, type: 'website', siteName: 'SIGNUM HQ',
      images: [{ url: image, width: 1200, height: 630, alt: c.title }] },
    twitter: { card: 'summary_large_image', title: c.title, description: c.description, images: [image] } };
}

// 영수증의 카드·간격·44px 조작 영역을 재사용하며 기존 다크 테마 토큰을 적용한다.
const READ_CHECK_CSS = `
.rc{width:100%;max-width:760px;margin:0 auto;padding:32px 16px 96px;background:var(--background,#1f2533);color:var(--foreground,#f8fafc);line-height:1.65;overflow-wrap:anywhere;color-scheme:dark}
.rc *{box-sizing:border-box;min-width:0}.rc h1{font-size:28px;line-height:1.3;font-weight:800;margin:8px 0}.rc h2{font-size:22px;font-weight:800;margin:0 0 12px}.rc h3{font-size:16px;font-weight:700;margin:20px 0 8px}.rc p{margin:10px 0}
.rc a{color:#7dd3fc;text-decoration:underline}.rc nav{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.rc nav a{display:inline-flex;align-items:center;min-height:44px}
.rc-input{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:20px 0}.rc-input label{width:100%}.rc input[type=text]{flex:1;width:160px;max-width:100%;text-transform:uppercase}
.rc button,.rc input[type=text]{border:1px solid var(--border,#64748b);border-radius:8px;padding:10px 12px;min-height:44px;background:var(--secondary,#1e293b);color:inherit;font:inherit}.rc button{cursor:pointer;font-weight:700}.rc button:hover{border-color:#7dd3fc}.rc :focus-visible{outline:2px solid #7dd3fc;outline-offset:3px}
.rc-cards{display:grid;gap:16px;margin:24px 0}.rc-card{border:1px solid var(--border,#64748b);border-radius:12px;padding:16px;background:var(--card,#1f2533)}
.rc fieldset{border:0;padding:0;margin:16px 0}.rc legend{font-weight:700;margin-bottom:12px}.rc-choice{display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid var(--border,#64748b);border-radius:8px;margin:8px 0;min-height:44px;cursor:pointer}.rc-choice input{flex-shrink:0;margin-top:6px;width:18px;height:18px;accent-color:#38bdf8}
.rc dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 12px;margin:20px 0}.rc dt{font-size:13px;color:#cbd5e1}.rc dd{margin:4px 0 0;font-weight:700;font-variant-numeric:tabular-nums}.rc-meta{font-size:12px;color:#cbd5e1}.rc-status{border-left:3px solid #7dd3fc;padding:8px 12px;font-weight:700}.rc-status[data-verdict=insufficient],.rc-note{color:#fcd34d}.rc-result{border-top:1px solid var(--border,#64748b);margin-top:20px;padding-top:16px}.rc ul{padding-left:20px}.rc li{margin:12px 0}.rc footer{margin-top:32px;padding:20px 16px;border:1px solid var(--border,#64748b);border-radius:12px}.rc .rc-app{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 18px;border-radius:8px;background:#075985;color:#fff;font-weight:800}
`;

export default async function ReadCheckPage({ params, searchParams }: Props) {
  const l = toLoc((await params).locale), c = READ_COPY[l], q = await searchParams;
  const ticker = parseTicker(q.t), invalid = q.t !== undefined && !ticker;
  const snapshot = await readCheckSnapshot(), cases = selectCases(snapshot.rows, ticker);
  return <main className="rc dark" lang={l}>
    <style>{READ_CHECK_CSS}</style>
    <p>SIGNUM HQ</p><h1>{c.title}</h1><p>{c.description}</p>
    <nav aria-label={c.languages}>{EW_LOCALES.map(loc => <a key={loc} href={path(loc)} hrefLang={loc} aria-current={loc === l ? 'page' : undefined}>
      {{ ko: '한국어', en: 'English', ja: '日本語' }[loc]}</a>)}</nav>
    <form className="rc-input" action={path(l)} method="get">
      <label htmlFor="read-ticker">{c.ticker}</label>
      <input id="read-ticker" name="t" type="text" list="read-tickers" maxLength={5} defaultValue={ticker ?? ''}
        autoComplete="off" aria-describedby="read-allowed" />
      <datalist id="read-tickers">{READ_CHECK_TICKERS.map(t => <option key={t} value={t} />)}</datalist>
      <button type="submit">{c.show}</button>
    </form>
    <p id="read-allowed" className="rc-meta">{c.allowed}: {READ_CHECK_TICKERS.join(' · ')}</p>
    {invalid && <p role="status" className="rc-note">{c.invalid}</p>}
    <p className="rc-meta">{c.readAt}: <time dateTime={snapshot.readAt}>{snapshot.readAt.slice(0, 16).replace('T', ' ')}</time> UTC</p>
    <div className="rc-cards">{cases.map(item => {
      const { kind, facts } = item, choice = parseChoice(q[kind]), available = usable(kind, facts);
      const verdict = choice ? judge(kind, choice, facts) : null;
      const date = facts[kind]?.date;
      return <article className="rc-card" key={kind} aria-labelledby={`read-${kind}`} data-kind={kind} data-ticker={item.ticker}>
        <h2 id={`read-${kind}`}>{c.kinds[kind]} · {item.ticker}</h2>
        {item.replaced && <p className="rc-note">{c.replaced(item.requested, item.ticker)}</p>}
        <p className="rc-meta">{c.sourceDate}: {date ? <time dateTime={date}>{date}</time> : c.missing}
          {' · '}{kind === 'options' ? 'Intrinio · EOD' : kind === 'darkPool' ? 'FINRA · EOD' : 'Intrinio · SEC Form 4'}</p>
        {kind === 'darkPool' && <p className="rc-meta">Data source: FINRA</p>}
        <form action={`${path(l)}#read-${kind}`} method="get">
          {ticker && <input type="hidden" name="t" value={ticker} />}
          {KINDS.filter(k => k !== kind).map(k => parseChoice(q[k]) && <input key={k} type="hidden" name={k} value={parseChoice(q[k])!} />)}
          <fieldset><legend>{c.choose}</legend>
            {(['claim', 'observe', 'opposite'] as const).map(value => <label key={value} className="rc-choice">
              <input type="radio" name={kind} value={value} required defaultChecked={choice === value} />
              <span>{c.choices[kind][value]}</span>
            </label>)}
          </fieldset><button type="submit">{c.check}</button>
        </form>
        {(choice || !available) && <section className="rc-result" aria-label={c.kinds[kind]}>
          <p className="rc-status" data-verdict={verdict ?? 'insufficient'}>{c.verdict[verdict ?? 'insufficient']}</p>
          <h3>{c.confirmed}</h3>
          {available ? <dl>{evidence(kind, facts, l).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p>{c.missing}</p>}
          {kind === 'insider' && available && <p>{facts.insider?.filingUrl
            ? <a href={facts.insider.filingUrl} rel="noopener noreferrer">{c.filing}</a> : `${c.filing}: ${c.missing}`}</p>}
          <h3>{c.unknown}</h3><p>{c.limits[kind]}</p>
          <h3>{c.better}</h3><p>{c.reading[kind]}</p>
        </section>}
      </article>;
    })}</div>
    <section aria-labelledby="read-method"><h2 id="read-method">{c.method}</h2><ul>{c.methods.map(m => <li key={m}>{m}</li>)}</ul></section>
    <footer><a className="rc-app" href={`https://www.signumhq.com/app?from=readcheck_${l}`}>{c.app}</a></footer>
  </main>;
}
