/** Offline: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/learnEarningsExpectedMove.test.ts */
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CONCEPTS, CONCEPT_SLUGS } from '../src/lib/seo/concepts';

const stub = (path: string, exports: unknown) => {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};
stub('../src/lib/net/publicBase', { publicBase: () => 'https://local.test' });
stub('../src/lib/marketing/pageViewMark', { markPageView: async () => {} });
const page = require('../src/app/[locale]/learn/[concept]/page');
const list = require('../src/app/[locale]/learn/page');
const slug = 'earnings-expected-move';
(async () => {
  assert.deepEqual(CONCEPT_SLUGS, ['dark-pool', 'max-pain', 'gamma-exposure', 'call-wall', 'put-call-ratio', 'options-flow', 'open-interest', slug, 'market-selloff']);
  const params = await page.generateStaticParams();
  for (const locale of ['en', 'ko', 'ja'] as const) {
    const concept = CONCEPTS[locale][slug];
    assert.ok(params.some((p: any) => p.locale === locale && p.concept === slug));
    const props = { params: Promise.resolve({ locale, concept: slug }) };
    const html = renderToStaticMarkup(await page.default(props));
    for (const path of [`/${locale}/earnings-week`, `/${locale}/learn/options-flow`, `/${locale}/learn/open-interest`]) assert.ok(html.includes(`href="${path}"`), path);
    for (const value of ['8.8%', '15.3%', '14.5%', '14.4%', '29', '22']) assert.ok(html.includes(value), `${locale}: ${value}`);
    assert.ok(html.includes(concept.h1));
    const meta = await page.generateMetadata(props);
    assert.equal(meta.alternates.canonical, `https://local.test/${locale}/learn/${slug}`);
    const listHtml = renderToStaticMarkup(await list.default({ params: Promise.resolve({ locale }) }));
    assert.ok(listHtml.includes(`/${locale}/learn/${slug}`));
    const selloff = 'market-selloff';
    const selloffProps = { params: Promise.resolve({ locale, concept: selloff }) };
    assert.ok(params.some((p: any) => p.locale === locale && p.concept === selloff));
    const selloffHtml = renderToStaticMarkup(await page.default(selloffProps));
    const c = CONCEPTS[locale][selloff];
    assert.equal(c.sections.length, 4);
    for (const value of [c.h1, '2026-11-05', '4.36%', '5.52%', '12.25%', '28.18', 'VIX3M', 'SOX', 'application/ld+json', 'BreadcrumbList', 'Article', `/${locale}/learn/earnings-expected-move`]) assert.ok(selloffHtml.includes(value), `${locale}: ${value}`);
    const selloffMeta = await page.generateMetadata(selloffProps);
    assert.equal(selloffMeta.alternates.canonical, `https://local.test/${locale}/learn/${selloff}`);
    assert.equal(selloffMeta.description, c.desc);
    assert.ok(listHtml.includes(`/${locale}/learn/${selloff}`));
  }
  console.log('✓ three localized concept pages, list, metadata, and links');
})().catch((error) => { console.error(error); process.exitCode = 1; });
