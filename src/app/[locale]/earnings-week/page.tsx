// ============================================================================
// /[locale]/earnings-week — 「이번 주 미국 실적 발표 + 옵션이 반영한 예상 변동폭 + Max Pain」 한 장. 공개·색인 대상. (2026-10-11)
//
// 왜: 커뮤니티는 «앱 홍보 글»은 지우지만 «유용한 정보 글»은 퍼뜨린다. 실적 시즌 첫 주(10/12~10/16)에 무료 정보 페이지를 내놓고,
//   그 안에서 앱 설치로 잇는다(대표 10/11 «커뮤니티·플랫폼을 통한 폭발 · 신규 설치 하루 100건»).
//
// 숫자의 출처는 전부 기존 «한 문»이다(새 계산·새 수집·새 캐시 키 없음) — services/earningsWeekService.ts 머리말 참고.
//   · 일정: 회사가 공지한 것만(lib/earningsConfirmed.ts). 추정 날짜는 표에 없다.
//   · 예상 변동: lib/impliedMove.ts 의 정의 하나(ATM 스트래들 ÷ 현물) · 레벨: 구조 판본 한 벌.
//   · 사용자 경로: Redis 읽기뿐. 낡은 사본은 즉시 주고 갱신은 응답 뒤.
// ============================================================================
import type { Metadata } from 'next';
import { after } from 'next/server';
import { publicBase } from '@/lib/net/publicBase';
import { markPageView } from '@/lib/marketing/pageViewMark';
import { getEarningsWeek } from '@/services/earningsWeekService';
import { COPY, EW_LOCALES, appLink, rangeText, toLoc, type Loc } from '@/lib/earningsWeek';
import { asOfLineOf, countsOf, topLineOf, viewRow } from '@/lib/earningsWeekView';
import { EarningsWeekShare } from '@/components/share/EarningsWeekShare';

// (layout 이 headers() 를 읽어 매 요청 동적 렌더다 — 신선도는 서비스의 60초 메모 + 마지막 정상본이 정한다)
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = toLoc(locale);
  const c = COPY[l];
  const base = publicBase();
  const data = await getEarningsWeek().catch(() => null);
  const range = data ? rangeText(data.range.start, data.range.end, l) : '';
  const top = data ? topLineOf(data, l) : null;
  const title = c.metaTitle(range).replace(/\s{2,}/g, ' ');
  const description = c.metaDesc({ n: data?.rows.length ?? 0, top, range });
  const url = `${base}/${l}/earnings-week`;
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { ...Object.fromEntries(EW_LOCALES.map((x) => [x, `${base}/${x}/earnings-week`])), 'x-default': `${base}/en/earnings-week` },
    },
    openGraph: { title, description, url, type: 'website', siteName: 'SIGNUM HQ' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

const CSS = `
.ew{max-width:960px;margin:0 auto;padding:28px 16px 72px;font-family:Pretendard,system-ui,-apple-system,'Segoe UI',sans-serif;color:#17191E;line-height:1.6;overflow-wrap:anywhere}
.ew *{box-sizing:border-box}
.ew-kicker{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#C2410C}
.ew-h1{font-size:26px;line-height:1.28;font-weight:900;margin:6px 0 8px}
.ew-lead{font-size:15px;color:#55606B;margin:0 0 16px;max-width:680px}
.ew-top{background:#FAF8F3;border:1px solid #E7E3DA;border-left:4px solid #C2410C;border-radius:12px;padding:12px 14px;margin:0 0 8px}
.ew-top strong{display:block;font-size:17px;font-weight:900;line-height:1.35}
.ew-top span{display:block;font-size:13px;color:#55606B;margin-top:2px}
.ew-meta{font-size:12.5px;color:#7C848E;margin:0 0 4px}
.ew-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0 14px}
.ew-btn{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13.5px;font-weight:800;color:#17191E;background:#fff;border:1px solid #D9D4C8;border-radius:999px;padding:8px 14px;cursor:pointer}
.ew-share{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap}
.ew-note{font-size:12.5px;color:#15803D;font-weight:700;min-height:1em}
.ew-list{list-style:none;margin:0;padding:0;border-top:1px solid #E7E3DA}
.ew-head{display:none}
.ew-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 8px;padding:13px 2px;border-bottom:1px solid #EEE9E0}
.ew-row[data-phase="done"] .ew-c:not(.ew-mv),.ew-row[data-phase="done"]:not([data-actual]) .ew-mv{opacity:.62}
.ew-c{min-width:0}
.ew-c::before{content:attr(data-l);display:block;font-size:10.5px;font-weight:700;color:#8A939E;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ew-c.ew-tk::before,.ew-c.ew-wh::before,.ew-c.ew-mv::before{display:none}
.ew-tk{grid-column:1/3;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ew-tk b{font-size:20px;font-weight:900;letter-spacing:.01em}
.ew-mv{grid-column:3/5;grid-row:1;text-align:right}
.ew-mv .v{font-size:21px;font-weight:900;color:#C2410C;line-height:1.15}
.ew-mv .t{display:block;font-size:11.5px;color:#7C848E}
.ew-mv .v.a{color:#17191E}
.ew-mv .t.x{color:#C2410C;font-weight:700}
.ew-src{grid-column:1/-1;font-size:11.5px;line-height:1.5;color:#7C848E;margin-top:-2px}
.ew-wh{grid-column:1/5;font-size:13px;color:#3F4650}
.ew-wh span{margin-left:8px;color:#7C848E;font-size:12.5px}
.ew-v{display:block;font-size:13.5px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
.ew-dash{color:#B5BCC6;font-weight:700}
.ew-chip{display:inline-block;font-size:11.5px;font-weight:800;border-radius:999px;padding:2px 9px;border:1px solid #D9D4C8;color:#55606B;background:#fff;white-space:nowrap}
.ew-chip.today{border-color:#C2410C;color:#C2410C}
.ew-chip.done{background:#EEE9E0;color:#55606B}
.ew-cta{margin:20px 0 6px;background:#17191E;color:#fff;border-radius:14px;padding:16px 16px 14px}
.ew-cta a{display:block;text-align:center;background:#C2410C;color:#fff;text-decoration:none;font-weight:900;font-size:15px;line-height:1.4;border-radius:12px;padding:13px 14px}
.ew-cta p{margin:8px 0 0;text-align:center;font-size:12px;color:#B5BCC6}
.ew-sec{margin-top:30px}
.ew-sec h2{font-size:15px;font-weight:900;margin:0 0 8px}
.ew-sec dl{margin:0}
.ew-sec dt{font-size:14px;font-weight:800;margin-top:10px}
.ew-sec dd{margin:2px 0 0;font-size:14px;color:#55606B}
.ew-pend{font-size:13px;color:#7C848E;margin:12px 0 0}
.ew-empty{font-size:15px;color:#55606B;padding:18px 0}
.ew-more{display:flex;flex-wrap:wrap;gap:8px}
.ew-more a{font-size:13.5px;font-weight:700;color:#17191E;text-decoration:none;border:1px solid #E7E3DA;border-radius:999px;padding:5px 12px;background:#fff}
.ew-foot{font-size:12px;color:#9AA3AD;margin-top:26px;border-top:1px solid #EEE9E0;padding-top:14px}
.ew-foot p{margin:0 0 4px}
@media (min-width:760px){
  .ew{padding-top:36px}
  .ew-h1{font-size:34px}
  .ew-head{display:grid;grid-template-columns:76px minmax(0,1.5fr) minmax(0,1.1fr) minmax(0,.8fr) minmax(0,.8fr) minmax(0,.8fr) minmax(0,.8fr);gap:12px;padding:8px 2px;font-size:11.5px;font-weight:800;color:#8A939E;border-bottom:1px solid #E7E3DA}
  .ew-row{grid-template-columns:76px minmax(0,1.5fr) minmax(0,1.1fr) minmax(0,.8fr) minmax(0,.8fr) minmax(0,.8fr) minmax(0,.8fr);align-items:start;gap:12px;padding:14px 2px}
  .ew-c::before{display:none!important}
  .ew-tk,.ew-wh,.ew-mv{grid-column:auto;grid-row:auto}
  .ew-tk{display:block}
  .ew-tk .ew-chip{display:inline-block;margin-top:4px}
  .ew-wh span{display:block;margin-left:0}
  .ew-mv{text-align:left}
  .ew-mv .v{font-size:19px}
  .ew-v{font-size:15px}
}
`;

type Params = { params: Promise<{ locale: string }> };

export default async function EarningsWeekPage({ params }: Params) {
  const { locale } = await params;
  const l: Loc = toLoc(locale);
  await markPageView('earnings_week', l);
  const c = COPY[l];
  const base = publicBase();
  const data = await getEarningsWeek({ background: (p) => after(() => p) });
  const nowMs = Date.now();
  const range = rangeText(data.range.start, data.range.end, l);
  const rows = data.rows.map((r) => ({ r, v: viewRow(r, l, data, nowMs) }));
  const counts = countsOf(data, nowMs);
  const top = topLineOf(data, l, nowMs);
  const asOf = asOfLineOf(data, l);
  const href = appLink(l, base);
  const url = `${base}/${l}/earnings-week`;
  const verifiedAt = data.listVerifiedAt ? data.listVerifiedAt.slice(0, 10) : '';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: c.metaTitle(range),
    url,
    inLanguage: l,
    isPartOf: { '@type': 'WebSite', name: 'SIGNUM HQ', url: base },
    dateModified: new Date(data.generatedAt).toISOString(),
    isAccessibleForFree: true,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: rows.length,
      itemListElement: rows.map(({ r }, i) => ({ '@type': 'ListItem', position: i + 1, name: `${r.ticker} ${r.date}` })),
    },
  };

  const cta = (
    <div className="ew-cta">
      <a href={href} rel="noopener">{c.cta} →</a>
      <p>{c.ctaSub} · {c.ctaNote}</p>
    </div>
  );

  return (
    <main className="ew" data-week-start={data.range.start} data-week-end={data.range.end}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <div className="ew-kicker">{c.kicker}</div>
      <h1 className="ew-h1">{c.h1(range)}</h1>
      <p className="ew-lead">{c.lead}</p>

      <div className="ew-top">
        <strong>{top ?? c.topNone}</strong>
        <span>{c.countLine(counts)}</span>
      </div>
      {data.range.rolled && <p className="ew-meta">{c.rolled}</p>}
      <p className="ew-meta">{asOf ?? c.asOfUnknown}</p>

      <div className="ew-actions">
        <EarningsWeekShare
          locale={l}
          label={c.share}
          copiedLabel={c.shareCopied}
          title={c.shareTitle(range)}
          text={c.shareText({ n: counts.n, top })}
        />
      </div>

      {rows.length === 0 ? (
        <p className="ew-empty">{c.empty}</p>
      ) : (
        <>
          <div className="ew-head" aria-hidden="true">
            <span>{c.col.stock}</span><span>{c.col.when}</span><span>{c.col.move}</span><span>{c.col.price}</span>
            <span>{c.col.maxPain}</span><span>{c.col.callWall}</span><span>{c.col.putFloor}</span>
          </div>
          <ul className="ew-list" aria-label={c.h1(range)}>
            {rows.map(({ r, v }) => (
              <li
                key={`${r.ticker}-${r.date}`}
                className="ew-row"
                data-ticker={r.ticker}
                data-date={r.date}
                data-hour={r.hour}
                data-phase={v.phase}
                data-implied={r.impliedMovePct ?? ''}
                data-expiry={r.impliedExpiry ?? ''}
                data-spot={r.spot ?? ''}
                data-maxpain={r.maxPain ?? ''}
                data-callwall={r.callWall ?? ''}
                data-putfloor={r.putFloor ?? ''}
                data-actual={r.actual ? r.actual.pct : undefined}
                data-actual-base={r.actual ? `${r.actual.baseDate}:${r.actual.baseClose}` : undefined}
                data-actual-react={r.actual ? `${r.actual.reactDate}:${r.actual.reactClose}` : undefined}
                data-expected={r.expectedAtReport ? r.expectedAtReport.pct : undefined}
                data-expected-session={r.expectedAtReport ? r.expectedAtReport.session : undefined}
              >
                <div className="ew-c ew-tk">
                  <b>{r.ticker}</b>
                  {v.phase === 'done' && <span className="ew-chip done">{c.done}</span>}
                  {v.phase === 'today' && <span className="ew-chip today">{c.today}</span>}
                </div>
                <div className="ew-c ew-wh">
                  {v.etLine}
                  {v.kstLine && <span>{v.kstLine}</span>}
                </div>
                <div className="ew-c ew-mv" data-l={c.col.move}>
                  {v.phase === 'done' ? (
                    v.actual ? (
                      <>
                        <span className="v a">{v.actual.headline}</span>
                        {v.actual.vs && <span className="t x">{v.actual.vs}</span>}
                      </>
                    ) : v.actualPending ? (
                      <span className="t">{v.actualPending}</span>
                    ) : (
                      <span className="ew-dash">—</span>
                    )
                  ) : v.moveText ? (
                    <>
                      <span className="v">{v.moveText}</span>
                      {v.moveTag && <span className="t">{v.moveTag}</span>}
                    </>
                  ) : (
                    <span className="ew-dash">{v.noData ? c.noData : '—'}</span>
                  )}
                </div>
                <div className="ew-c" data-l={c.col.price}>{v.priceText ? <span className="ew-v">{v.priceText}</span> : <span className="ew-dash">—</span>}</div>
                <div className="ew-c" data-l={c.col.maxPain}>{v.maxPain ? <span className="ew-v">{v.maxPain}</span> : <span className="ew-dash">—</span>}</div>
                <div className="ew-c" data-l={c.col.callWall}>{v.callWall ? <span className="ew-v">{v.callWall}</span> : <span className="ew-dash">—</span>}</div>
                <div className="ew-c" data-l={c.col.putFloor}>{v.putFloor ? <span className="ew-v">{v.putFloor}</span> : <span className="ew-dash">—</span>}</div>
                {v.actual && <div className="ew-src">{v.actual.src}</div>}
              </li>
            ))}
          </ul>
        </>
      )}

      {data.pending.length > 0 && (
        <p className="ew-pend">
          <b>{c.pendingT}</b> — {c.pendingNote} {data.pending.map((p) => `${p.ticker} ${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8, 10))}`).join(' · ')}
        </p>
      )}

      {cta}

      <section className="ew-sec">
        <h2>{c.readT}</h2>
        <dl>
          {c.read.map(([t, b]) => (
            <div key={t}><dt>{t}</dt><dd>{b}</dd></div>
          ))}
        </dl>
      </section>

      <section className="ew-sec">
        <h2>{c.moreT}</h2>
        <div className="ew-more">
          <a href={`/${l}/dark-pool`}>{c.moreDp}</a>
          <a href={`/${l}/options-flow`}>{c.moreOf}</a>
          <a href={`/${l}/tickers`}>{c.moreAll}</a>
        </div>
      </section>

      {cta}

      <footer className="ew-foot">
        {verifiedAt && <p>{c.verified({ at: verifiedAt })}</p>}
        <p>{c.disc}</p>
      </footer>
    </main>
  );
}
