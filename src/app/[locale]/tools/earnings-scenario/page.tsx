import type { Metadata } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import { EW_LOCALES, toLoc } from '@/lib/earningsWeek';
import { SCENARIO_COPY } from '@/lib/earningsScenario/copy';
import { scenarioSnapshot } from '@/services/earningsScenarioService';
import ScenarioClient from './ScenarioClient';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string }> };
const path = (l: string) => `/${l}/tools/earnings-scenario`;
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = toLoc((await params).locale), c = SCENARIO_COPY[l], base = publicBase();
  const url = `${base}${path(l)}`, image = `${url}/og`;
  return { title: c.title, description: c.description, robots: { index: true, follow: true },
    alternates: { canonical: url, languages: { ...Object.fromEntries(EW_LOCALES.map(loc => [loc, `${base}${path(loc)}`])), 'x-default': `${base}${path('en')}` } },
    openGraph: { title: c.title, description: c.description, url, type: 'website', siteName: 'SIGNUM HQ',
      images: [{ url: image, width: 1200, height: 630, alt: c.title }] },
    twitter: { card: 'summary_large_image', title: c.title, description: c.description, images: [image] } };
}

// 기존 read-check/영수증의 토큰·간격·375px 단일 열·44px 조작 영역을 새 경로 안에서만 재사용한다.
const CSS = `
.es{width:100%;max-width:760px;margin:0 auto;padding:32px 16px 96px;background:var(--background,#1f2533);color:var(--foreground,#f8fafc);line-height:1.65;overflow-wrap:anywhere;color-scheme:dark}
.es *{box-sizing:border-box;min-width:0}.es h1{font-size:28px;line-height:1.3;font-weight:800;margin:8px 0}.es h2{font-size:22px;font-weight:800;margin:0 0 12px}.es p{margin:10px 0}
.es a{color:#7dd3fc;text-decoration:underline}.es nav{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.es nav a{display:inline-flex;align-items:center;min-height:44px}
.es-card{border:1px solid var(--border,#64748b);border-radius:12px;padding:16px;margin:16px 0;background:var(--card,#1f2533)}
.es button,.es select{border:1px solid var(--border,#64748b);border-radius:8px;padding:10px 12px;min-height:44px;background:var(--secondary,#1e293b);color:inherit;font:inherit;max-width:100%}.es select{width:100%;margin:8px 0}.es button{cursor:pointer;font-weight:700}.es :focus-visible{outline:2px solid #7dd3fc;outline-offset:3px}
.es fieldset{border:0;padding:0;margin:16px 0}.es legend{font-weight:700;margin-bottom:12px}.es-choice{display:flex;gap:12px;align-items:center;padding:12px;border:1px solid var(--border,#64748b);border-radius:8px;margin:8px 0;min-height:44px;cursor:pointer}.es-choice input{width:18px;height:18px;accent-color:#38bdf8;flex-shrink:0}
.es dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 12px;margin:20px 0}.es dt{font-size:13px;color:#cbd5e1}.es dd{margin:4px 0 0;font-weight:700;font-variant-numeric:tabular-nums}.es-meta{font-size:12px;color:#cbd5e1}.es-note{color:#fcd34d;border-left:3px solid #7dd3fc;padding:8px 12px;font-weight:700}
.es-slider{margin:20px 0}.es-slider label{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.es-slider output{font-variant-numeric:tabular-nums;font-weight:700}.es input[type=range]{display:block;width:100%;min-height:44px;accent-color:#38bdf8;margin:8px 0}.es input:disabled{opacity:.5}.es ul{padding-left:20px}.es li{margin:12px 0}.es footer{margin-top:32px;padding:20px 16px;border:1px solid var(--border,#64748b);border-radius:12px}.es .es-app{display:flex;align-items:center;justify-content:center;min-height:48px;padding:12px 18px;border-radius:8px;background:#075985;color:#fff;font-weight:800}
@media(max-width:420px){.es .es-result{grid-template-columns:minmax(0,1fr)}}
`;
export default async function EarningsScenarioPage({ params }: Props) {
  const l = toLoc((await params).locale), c = SCENARIO_COPY[l], snapshot = await scenarioSnapshot();
  return <main className="es dark" lang={l}>
    <style>{CSS}</style><p>SIGNUM HQ</p><h1>{c.title}</h1><p>{c.description}</p>
    <nav aria-label={c.languages}>{EW_LOCALES.map(loc => <a key={loc} href={path(loc)} hrefLang={loc} aria-current={loc === l ? 'page' : undefined}>
      {{ ko: '한국어', en: 'English', ja: '日本語' }[loc]}</a>)}</nav>
    <p className="es-meta">{c.readAt}: <time dateTime={snapshot.readAt}>{snapshot.readAt.slice(0, 16).replace('T', ' ')}</time> UTC</p>
    <ScenarioClient locale={l} rows={snapshot.rows} />
    <section aria-labelledby="scenario-method"><h2 id="scenario-method">{c.method}</h2><ul>{c.methods.map(m => <li key={m}>{m}</li>)}</ul></section>
    <footer><a className="es-app" href={`https://www.signumhq.com/app?from=scenario_${l}`}>{c.app}</a></footer>
  </main>;
}
