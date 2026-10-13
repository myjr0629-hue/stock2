// ============================================================================
// /[locale]/s/[kind]/[ticker] — 공유 카드를 «받은 사람»이 여는 웹 페이지 (2026-10-14, 브랜치 feat/viral-loop)
//
//   /ko|en|ja/s/pick|line|earn/<TICKER>?from=share_<kind>&ref=<익명 초대 id>&via=ios|android|web
//
// 앱 안 세 곳(✦AI 오늘 볼 것 · 내 종목 ✦AI 한 줄 · 실적 옵션 반영 변동폭)의 공유 단추가 보낸 링크의 도착지다.
// 받은 사람은 그 카드 내용을 웹에서 보고 «앱에서 이어 보기»(설치)로 간다.
//
// · 내용은 «서버가 저장본에서 읽어» 그린다 — 주소의 글을 쓰지 않는다(위조 불가). 새 AI 호출·공급사 호출·생성 0, 저장본이 없으면 «생성하지 않고» 대체 화면.
//   읽기·서식은 전부 lib/invite/landing.ts (OG 이미지와 같은 뷰 모델 — 페이지와 링크 미리보기의 숫자가 갈라지지 않는다).
// · 색인하지 않는다(robots noindex,follow) — 공유 카드는 개인 링크의 도착지이고 시간이 지나면 내용이 바뀐다.
// · 클라이언트 JS 0 — 카카오톡·LINE 인앱 브라우저에서도 서버가 그린 그대로 보인다(공유 단추를 두지 않는다).
// · 보낸 쪽 «열림» 계측: 사람 요청(classifyClick === 'human')만, 응답 뒤(after)에서 share:open:<표면>:<via>:<ET날짜> 를 센다. 렌더를 막지 않는다.
// ============================================================================
import type { Metadata } from 'next';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound, unstable_rethrow } from 'next/navigation';
import { after } from 'next/server';
import { publicBase } from '@/lib/net/publicBase';
import { classifyClick } from '@/lib/marketing/clickHuman';
import { bumpShare } from '@/lib/invite/metrics';
import { SHARE_SURFACE, toInviteLang, type InviteLang, type ShareKind } from '@/lib/invite/kinds';
import { normalizeGiftRef } from '@/lib/gift/gift';
import { giftConfig } from '@/lib/gift/giftConfig';
import { UI } from '@/lib/todayPicks/copy';
import { COPY } from '@/lib/earningsWeek';
import {
  cardPathOf, landingCta, loadLanding, makeDefaultDeps, parseLandingParams, viaOf,
  type LandingView,
} from '@/lib/invite/landing';

// (layout 이 headers() 를 읽어 매 요청 동적 렌더다 — 저장본 읽기만이라 가볍다)
export const dynamic = 'force-dynamic';

type Params = { locale: string; kind: string; ticker: string };
type Props = { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** 같은 요청 안의 generateMetadata 와 page 가 저장본을 두 번 읽지 않게(React cache — 요청 단위) */
const getView = cache(async (kind: ShareKind, ticker: string, lang: InviteLang): Promise<LandingView> =>
  loadLanding(kind, ticker, lang, makeDefaultDeps((p) => { try { after(() => p); } catch { /* 요청 범위 밖 */ } })));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const parsed = parseLandingParams(p.kind, p.ticker);
  if (!parsed) return { robots: { index: false, follow: false } };
  const lang = toInviteLang(p.locale);
  const v = await getView(parsed.kind, parsed.ticker, lang);
  const base = publicBase();
  const url = `${base}${cardPathOf(parsed.kind, parsed.ticker, lang)}`;
  return {
    title: v.title,
    description: v.description,
    // 공유 카드 페이지는 색인하지 않는다(링크는 따라가게 둔다)
    robots: { index: false, follow: true },
    ...(v.canonicalPath ? { alternates: { canonical: `${base}${v.canonicalPath}` } } : {}),
    // og:image 는 같은 폴더의 opengraph-image.tsx 가 자동으로 붙는다
    openGraph: { title: v.title, description: v.description, url, type: 'website', siteName: 'SIGNUM HQ' },
    twitter: { card: 'summary_large_image', title: v.title, description: v.description },
  };
}

const CSS = `
.sc{max-width:640px;margin:0 auto;padding:26px 16px 72px;font-family:Pretendard,system-ui,-apple-system,'Segoe UI',sans-serif;color:#17191E;line-height:1.6;overflow-wrap:anywhere;word-break:keep-all}
.sc *{box-sizing:border-box}
.sc-kicker{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#4C1D95}
.sc-ai{display:inline-flex;align-items:center;gap:3px;padding:0 7px 0 6px;border-radius:6px;font-size:11px;font-weight:800;line-height:19px;letter-spacing:.06em;color:#fff;background:linear-gradient(100deg,#7c3aed 0%,#0369a1 100%);flex:0 0 auto}
.sc-ai i{font-style:normal}
.sc-h1{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin:10px 0 2px;font-size:15px;font-weight:700;color:#55606B;line-height:1.3}
.sc-tk{font-size:40px;font-weight:900;letter-spacing:.01em;color:#17191E;line-height:1.1}
.sc-chip{font-size:12px;font-weight:800;letter-spacing:.04em;border-radius:999px;padding:1px 10px;background:#F1ECFB;color:#4C1D95;line-height:20px}
.sc-name{margin:0 0 4px;font-size:14px;font-weight:700;color:#55606B}
.sc-card{margin:14px 0 0;border:1px solid #E7E3DA;border-radius:16px;padding:18px 16px 14px;background:#FFFFFF}
.sc-hero{display:flex;flex-direction:column;gap:2px;margin:0 0 12px}
.sc-hero b{font-size:46px;line-height:1.05;font-weight:900;color:#C2410C;letter-spacing:-.01em}
.sc-hero span{font-size:14px;font-weight:800;color:#17191E}
.sc-hero em{font-style:normal;font-size:12.5px;color:#7C848E}
.sc-head{display:flex;gap:8px;align-items:flex-start;margin:0 0 4px;font-size:17px;font-weight:800;line-height:1.5;color:#17191E}
.sc-head .sc-ai{margin-top:5px}
.sc-why{display:flex;gap:8px;align-items:flex-start;margin:8px 0 0;font-size:15px;color:#0C5A85}
.sc-why.rule{color:#55606B}
.sc-why .sc-ai{margin-top:3px}
.sc-rows{margin:14px 0 0;padding:0;border-top:1px solid #EEE9E0}
.sc-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:9px 0;border-bottom:1px solid #EEE9E0;align-items:baseline}
.sc-row dt{font-size:13px;font-weight:700;color:#7C848E}
.sc-row dd{margin:0;text-align:right;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
.sc-row .n{grid-column:1/3;text-align:right;font-size:12px;font-weight:600;color:#7C848E}
.sc-asof{margin:12px 0 0;font-size:12.5px;color:#7C848E}
.sc-fact{margin:2px 0 0;font-size:12.5px;color:#7C848E}
.sc-fb{font-size:15px;color:#3F4650;margin:0}
.sc-cta{margin:16px 0 6px;background:#17191E;color:#fff;border-radius:14px;padding:16px 16px 14px}
.sc-cta a{display:block;text-align:center;background:#7C3AED;color:#fff;text-decoration:none;font-weight:900;font-size:16px;line-height:1.4;border-radius:12px;padding:14px 14px}
.sc-cta p{margin:9px 0 0;text-align:center;font-size:12.5px;color:#B5BCC6}
.sc-cta p.code{color:#E4E7EC;font-weight:700}
.sc-sec{margin-top:28px}
.sc-sec h2{font-size:15px;font-weight:900;margin:0 0 8px}
.sc-oth{list-style:none;margin:0;padding:0;border-top:1px solid #E7E3DA}
.sc-oth li{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;padding:10px 2px;border-bottom:1px solid #EEE9E0;font-size:14px}
.sc-oth b,.sc-oth a.t{font-size:16px;font-weight:900;color:#17191E;text-decoration:none}
.sc-oth a.t:hover{text-decoration:underline}
.sc-oth .sc-chip{font-size:11px;line-height:18px}
.sc-oth span.x{flex:1 1 100%;color:#55606B}
.sc-ex dt{font-size:14px;font-weight:800;margin-top:8px}
.sc-ex dd{margin:2px 0 0;font-size:14px;color:#55606B}
.sc-more{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.sc-more a{font-size:13.5px;font-weight:700;color:#17191E;text-decoration:none;border:1px solid #E7E3DA;border-radius:999px;padding:6px 13px;background:#fff}
.sc-foot{font-size:12px;color:#9AA3AD;margin-top:26px;border-top:1px solid #EEE9E0;padding-top:14px}
.sc-foot p{margin:0 0 4px}
@media (min-width:760px){.sc{padding-top:36px}.sc-tk{font-size:48px}}
`;

function AiBadge({ label }: { label: string }) {
  return <span className="sc-ai" role="img" aria-label={label}><i aria-hidden="true">✦</i>AI</span>;
}

export default async function ShareCardPage({ params, searchParams }: Props) {
  const p = await params;
  const parsed = parseLandingParams(p.kind, p.ticker);
  if (!parsed) notFound();
  const { kind, ticker } = parsed;
  const lang = toInviteLang(p.locale);
  const sp = await searchParams;
  const first = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x);

  // 보낸 쪽 «열림» — 사람 요청만. headers() 는 try 밖에 둔다(Next 의 동적 렌더 신호를 삼키면 안 된다)
  const h = await headers();
  try {
    if (classifyClick(h, 'GET') === 'human') {
      const via = viaOf(first(sp.via));
      after(() => bumpShare('open', SHARE_SURFACE[kind], via));
    }
  } catch (e) {
    unstable_rethrow(e);
    /* 집계 준비 실패는 화면에 닿지 않는다 */
  }

  const v = await getView(kind, ticker, lang);
  const gift = giftConfig();
  const cta = landingCta(kind, lang, { ref: normalizeGiftRef(first(sp.ref)), gift });
  const ui = UI[lang];
  const c = COPY[lang];

  const ctaBox = (
    <div className="sc-cta">
      <a href={cta.href} rel="noopener">{cta.label} →</a>
      <p>{cta.sub}</p>
      {cta.codeLine && <p className="code">{cta.codeLine}</p>}
    </div>
  );

  return (
    <main className="sc" data-kind={kind} data-ticker={ticker} data-ok={v.ok ? '1' : '0'} data-fallback={v.fallbackReason ?? ''}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="sc-kicker">
        {v.aiBadge && <AiBadge label={ui.aiAria} />}
        <span>{v.kindName}</span>
      </div>
      <h1 className="sc-h1">
        <span className="sc-tk">{ticker}</span>
        {v.chip && <span className="sc-chip">{v.chip}</span>}
      </h1>
      {v.name && <p className="sc-name">{v.name}</p>}

      <section className="sc-card" aria-label={`${ticker} ${v.kindName}`}>
        {v.ok ? (
          <>
            {v.hero && (
              <div className="sc-hero">
                <b>{v.hero.value}</b>
                <span>{v.hero.label}</span>
                {v.hero.note && <em>{v.hero.note}</em>}
              </div>
            )}
            {v.headline && (
              <p className="sc-head">
                {v.headlineAi && <AiBadge label={ui.aiAria} />}
                <span>{v.headline}</span>
              </p>
            )}
            {v.aiLine && (
              <p className={`sc-why${v.aiLine.ai ? '' : ' rule'}`}>
                {v.aiLine.ai && <AiBadge label={ui.aiAria} />}
                <span>{v.aiLine.text}</span>
              </p>
            )}
          </>
        ) : (
          <p className="sc-fb">{v.fallbackText}</p>
        )}
        {v.rows.length > 0 && (
          <dl className="sc-rows">
            {v.rows.map((r) => (
              <div className="sc-row" key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
                {r.note && <span className="n">{r.note}</span>}
              </div>
            ))}
          </dl>
        )}
        {v.ok && v.asOf && <p className="sc-asof">{v.asOf}</p>}
        {v.ok && v.facts.map((f) => <p className="sc-fact" key={f}>{f}</p>)}
      </section>

      {ctaBox}

      {v.others.length > 0 && (
        <section className="sc-sec">
          <h2>{v.othersTitle}</h2>
          <ul className="sc-oth">
            {v.others.map((o) => (
              <li key={o.ticker}>
                {o.href ? <a className="t" href={o.href}>{o.ticker}</a> : <b>{o.ticker}</b>}
                {o.chip && <span className="sc-chip">{o.chip}</span>}
                <span className="x">{o.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {v.ok && v.explain.length > 0 && (
        <section className="sc-sec">
          <h2>{v.explainTitle}</h2>
          <dl className="sc-ex">
            {v.explain.map(([t, b]) => (
              <div key={t}><dt>{t}</dt><dd>{b}</dd></div>
            ))}
          </dl>
        </section>
      )}

      {v.links.length > 0 && (
        <div className="sc-more">
          {v.links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </div>
      )}

      {ctaBox}

      <footer className="sc-foot">
        <p>{c.disc}</p>
      </footer>
    </main>
  );
}
