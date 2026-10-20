// ============================================================================
// /[locale]/today — 「✦ AI 오늘 볼 것」 공개 페이지 (2026-10-13, 대표 10/13 «떠먹여주는 완벽한 앱 · 설치 하루 100건»)
//
// 앱 대시보드 카드와 같은 문서(서버가 하루 두 번 저장해 둔 5개 항목 + 항목별 AI 한 줄)를 그대로 보여 준다. 홍보 링크·검색·공유용.
// 사용자·크롤러 경로는 저장본 읽기뿐이다 — 새 생성·공급사 호출·AI 호출 0(크레딧 규칙). 끄기 스위치(레디스 todaypicks:off)가 켜지면 빈 페이지(noindex).
// 숫자·날짜는 규칙 문장(lib/todayPicks/copy)이고, AI 는 «왜 볼 만한가» 한 줄뿐이다(AI 가 쓴 줄에만 «✦ AI» 표식).
// 다크풀 항목에는 출처 FINRA 를 적는다(FINRA 약관 §2.3 — 무료로 연다).
// ============================================================================
import type { Metadata } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import { markPageView } from '@/lib/marketing/pageViewMark';
import { readPicks } from '@/services/todayPicksService';
import { buildView, hasIndexablePicks } from '@/lib/todayPicks/view';
import { TODAY_APP_CODE, TODAY_APP_FROM } from '@/lib/todayPicks/view';
import { UI } from '@/lib/todayPicks/copy';
import { COPY, EW_LOCALES, toLoc, type Loc } from '@/lib/earningsWeek';
import { FLOW_TICKERS } from '@/lib/seo/flowTickers';
import { TodayPicksShare } from '@/components/share/TodayPicksShare';

export const dynamic = 'force-dynamic';

const FLOW_SET = new Set<string>(FLOW_TICKERS as readonly string[]);

async function load(l: Loc) {
  const read = await readPicks().catch(() => ({ doc: null, off: false, ageMs: null }));
  return { view: buildView(read.doc, l, read.off), doc: read.doc };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = toLoc(locale);
  const ui = UI[l];
  const base = publicBase();
  const { view } = await load(l);
  const first = view.items[0];
  const top = first ? `${first.ticker} ${first.what}` : null;
  const url = `${base}/${l}/today`;
  const title = ui.metaTitle;
  const description = ui.metaDesc(top);
  return {
    title,
    description,
    // 목록이 없으면(끄기·저장본 없음) 얇은 페이지를 색인하지 않는다
    robots: hasIndexablePicks(view) ? undefined : { index: false, follow: true },
    alternates: {
      canonical: url,
      languages: { ...Object.fromEntries(EW_LOCALES.map((x) => [x, `${base}/${x}/today`])), 'x-default': `${base}/en/today` },
    },
    openGraph: { title, description, url, type: 'website', siteName: 'SIGNUM HQ' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

const CSS = `
.tp{max-width:760px;margin:0 auto;padding:28px 16px 72px;font-family:Pretendard,system-ui,-apple-system,'Segoe UI',sans-serif;color:#17191E;line-height:1.6;overflow-wrap:anywhere}
.tp *{box-sizing:border-box}
.tp-kicker{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#4C1D95}
.tp-badge{display:inline-flex;align-items:center;gap:3px;padding:0 7px 0 6px;border-radius:6px;font-size:11px;font-weight:800;line-height:19px;letter-spacing:.06em;color:#fff;background:linear-gradient(100deg,#7c3aed 0%,#0369a1 100%)}
.tp-h1{font-size:26px;line-height:1.28;font-weight:900;margin:8px 0 8px}
.tp-lead{font-size:15px;color:#55606B;margin:0 0 12px;max-width:640px}
.tp-meta{font-size:12.5px;color:#7C848E;margin:0 0 4px}
.tp-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0 14px}
.tp-btn{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13.5px;font-weight:800;color:#17191E;background:#fff;border:1px solid #D9D4C8;border-radius:999px;padding:8px 14px;cursor:pointer}
.tp-share{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap}
.tp-note{font-size:12.5px;color:#15803D;font-weight:700;min-height:1em}
.tp-list{list-style:none;margin:0;padding:0;border-top:1px solid #E7E3DA}
.tp-item{display:grid;grid-template-columns:28px minmax(0,1fr);gap:0 10px;padding:15px 2px;border-bottom:1px solid #EEE9E0}
.tp-n{font-size:15px;font-weight:900;color:#B5BCC6;line-height:1.5}
.tp-top{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 9px}
.tp-tk{font-size:21px;font-weight:900;letter-spacing:.01em;color:#17191E;text-decoration:none}
a.tp-tk:hover{text-decoration:underline}
.tp-chip{font-size:11px;font-weight:800;letter-spacing:.04em;border-radius:999px;padding:1px 9px;background:#F1ECFB;color:#4C1D95}
.tp-asof{margin-left:auto;font-size:12px;color:#7C848E;white-space:nowrap}
.tp-what{margin-top:4px;font-size:15px;font-weight:700;color:#17191E}
.tp-why{display:flex;gap:7px;align-items:flex-start;margin-top:5px;font-size:14px;color:#0C5A85}
.tp-why.rule{color:#55606B}
.tp-ai{flex:0 0 auto;display:inline-flex;align-items:center;gap:2px;margin-top:3px;padding:0 6px 0 5px;border-radius:5px;font-size:10px;font-weight:800;line-height:16px;letter-spacing:.06em;color:#fff;background:linear-gradient(100deg,#7c3aed 0%,#0369a1 100%)}
.tp-cta{margin:20px 0 6px;background:#17191E;color:#fff;border-radius:14px;padding:16px 16px 14px}
.tp-cta a{display:block;text-align:center;background:#7C3AED;color:#fff;text-decoration:none;font-weight:900;font-size:15px;line-height:1.4;border-radius:12px;padding:13px 14px}
.tp-cta p{margin:8px 0 0;text-align:center;font-size:12px;color:#B5BCC6}
.tp-sec{margin-top:30px}
.tp-sec h2{font-size:15px;font-weight:900;margin:0 0 8px}
.tp-sec dl{margin:0}
.tp-sec dt{font-size:14px;font-weight:800;margin-top:10px}
.tp-sec dd{margin:2px 0 0;font-size:14px;color:#55606B}
.tp-rule{font-size:13.5px;color:#55606B;margin:14px 0 0}
.tp-empty{font-size:15px;color:#55606B;padding:18px 0}
.tp-more{display:flex;flex-wrap:wrap;gap:8px}
.tp-more a{font-size:13.5px;font-weight:700;color:#17191E;text-decoration:none;border:1px solid #E7E3DA;border-radius:999px;padding:5px 12px;background:#fff}
.tp-foot{font-size:12px;color:#9AA3AD;margin-top:26px;border-top:1px solid #EEE9E0;padding-top:14px}
.tp-foot p{margin:0 0 4px}
@media (min-width:760px){.tp{padding-top:36px}.tp-h1{font-size:34px}.tp-item{padding:18px 2px}}
`;

type Params = { params: Promise<{ locale: string }> };

export default async function TodayPage({ params }: Params) {
  const { locale } = await params;
  const l: Loc = toLoc(locale);
  await markPageView('today', l);
  const ui = UI[l];
  const c = COPY[l];
  const base = publicBase();
  const { view, doc } = await load(l);
  const href = `${base}/app?from=${TODAY_APP_FROM}&code=${TODAY_APP_CODE[l]}`;
  const url = `${base}/${l}/today`;
  const first = view.items[0];
  const topText = first ? `${first.ticker} ${first.what}` : null;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: ui.metaTitle,
    url,
    inLanguage: l,
    isPartOf: { '@type': 'WebSite', name: 'SIGNUM HQ', url: base },
    ...(doc ? { dateModified: new Date(doc.at).toISOString() } : {}),
    isAccessibleForFree: true,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: view.items.length,
      itemListElement: view.items.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: `${p.ticker} — ${p.what}` })),
    },
  };

  const cta = (
    <div className="tp-cta">
      <a href={href} rel="noopener">{c.cta} →</a>
      <p>{c.ctaSub} · {c.ctaNote}</p>
    </div>
  );

  return (
    <main className="tp" data-picked={doc?.at ?? ''}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <div className="tp-kicker"><span className="tp-badge" aria-hidden="true">✦ AI</span>{ui.title}</div>
      <h1 className="tp-h1">{ui.webH1}</h1>
      <p className="tp-lead">{ui.webLead}</p>
      {view.pickedAt && <p className="tp-meta">{ui.pickedLine(view.pickedAt)}</p>}

      <div className="tp-actions">
        <TodayPicksShare locale={l} label={c.share} copiedLabel={c.shareCopied} title={ui.shareTitle} text={ui.shareText(topText)} />
      </div>

      {view.items.length === 0 ? (
        <p className="tp-empty">{ui.empty}</p>
      ) : (
        <ol className="tp-list" aria-label={ui.webH1}>
          {view.items.map((p, i) => (
            <li key={p.id} className="tp-item" data-kind={p.kind} data-ticker={p.ticker}>
              <span className="tp-n">{i + 1}</span>
              <div>
                <div className="tp-top">
                  {FLOW_SET.has(p.ticker) ? <a className="tp-tk" href={`/${l}/flow/${p.ticker}`}>{p.ticker}</a> : <b className="tp-tk">{p.ticker}</b>}
                  <span className="tp-chip">{p.label}</span>
                  <span className="tp-asof">{p.asOf}</span>
                </div>
                <div className="tp-what">{p.what}</div>
                <div className={`tp-why${p.ai ? '' : ' rule'}`}>
                  {p.ai && <span className="tp-ai" aria-label={ui.aiAria}>✦ AI</span>}
                  <span>{p.why}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="tp-rule">{ui.howRule}{view.hasFinra ? ` ${ui.sourceFinra}.` : ''}</p>

      {cta}

      <section className="tp-sec">
        <h2>{ui.howT}</h2>
        <dl>
          {ui.how.map(([t, b]) => (
            <div key={t}><dt>{t}</dt><dd>{b}</dd></div>
          ))}
        </dl>
      </section>

      <section className="tp-sec">
        <h2>{c.moreT}</h2>
        <div className="tp-more">
          <a href={`/${l}/earnings-week`}>{COPY[l].kicker}</a>
          <a href={`/${l}/dark-pool`}>{c.moreDp}</a>
          <a href={`/${l}/options-flow`}>{c.moreOf}</a>
          <a href={`/${l}/tickers`}>{c.moreAll}</a>
        </div>
      </section>

      {cta}

      <footer className="tp-foot">
        <p>{c.disc}</p>
      </footer>
    </main>
  );
}
