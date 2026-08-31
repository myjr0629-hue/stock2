#!/usr/bin/env node
// ============================================================================
// make-rank-spec — «장중 랭킹» 영상 스펙 생성기 (en/ko/ja)
//
// [2026-09-01 대표 지적]
//   ① 「과거 데이터는 관심 없다」 → FINRA 다크풀은 T+1 이라 그날 못 쓴다(실측:
//      당일 조회 HTTP 204). 여기서 쓰는 값은 전부 «지금» 확정되는 것들이다 —
//      옵션 프리미엄·콜풋·PCR·맥스페인·현재가.
//   ② 「심볼도 크고 강하게」 → card 장면(심볼 208px).
//   ③ 「정확하고 강하게 자막으로, 자세한 자료 표기와 함께」 → 자막은 아래
//      caption() 에서 «숫자로 증명되는 문장»만 만든다. 형용사를 붙이지 않는다.
//   ④ 「앱 화면을 넣어서」 → 마지막에서 두 번째 컷이 실제 앱 녹화다.
//
// 실행: node scripts/make-rank-spec.js <ko|en|ja> <frames_dir> > spec.json
// ============================================================================
const LOCALE = (process.argv[2] || 'ko').toLowerCase();
const FRAMES = process.argv[3] || '';
const UNIVERSE = ['NVDA','TSLA','MU','AVGO','AAPL','AMZN','MSFT','META','GOOGL','AMD','PLTR','NFLX'];
const TOP = 5;

const T = {
  ko: { title:'지금 옵션에 돈이 몰린 곳', sub:'미국 정규장 · 실시간',
        ranking:'오늘 옵션 프리미엄 TOP {N}', rankingSub:'미국 대형주 · 정규장 실시간',
        rankUnit:'위', prem:'총 프리미엄', call:'콜', put:'풋', pcr:'거래량 PCR', mp:'맥스페인',
        callL:'콜 프리미엄', putL:'풋 프리미엄',
        appCap:'다섯 종목 전부 앱에서 실시간으로 본다', cta:'무료 · 광고 지원',
        foot:'signumhq.com/app', hookCap:'상위 5개를 5위부터 센다' },
  en: { title:'Where options money is right now', sub:'US regular session · live',
        ranking:'TODAY\u0027S OPTIONS PREMIUM — TOP {N}', rankingSub:'US megacaps · live regular session',
        rankUnit:'', prem:'Total premium', call:'Calls', put:'Puts', pcr:'Volume PCR', mp:'Max pain',
        callL:'Call premium', putL:'Put premium',
        appCap:'All five, live in the app', cta:'Free · ad-supported',
        foot:'signumhq.com/app', hookCap:'Counting down from 5' },
  ja: { title:'いまオプションの資金が集まる銘柄', sub:'米国レギュラー · リアルタイム',
        ranking:'本日のオプション プレミアム TOP {N}', rankingSub:'米国大型株 · レギュラー時間',
        rankUnit:'位', prem:'総プレミアム', call:'コール', put:'プット', pcr:'出来高PCR', mp:'マックスペイン',
        callL:'コール', putL:'プット',
        appCap:'5銘柄すべてアプリでリアルタイム', cta:'無料 · 広告あり',
        foot:'signumhq.com/app', hookCap:'5位から数える' },
}[LOCALE];

const money = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v/1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v/1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
};

// 자막 — 숫자에서 «증명되는» 문장만. 예측·형용사 금지(대표 규칙).
function caption(r) {
  const parts = [];
  const dollarRatio = r.put > 0 ? r.call / r.put : null;
  // 계약수(PCR)와 «돈»(프리미엄)이 반대로 갈 때가 가장 정보가 많다.
  if (r.pcr && r.pcr > 1.3 && dollarRatio && dollarRatio > 1.3) {
    if (LOCALE === 'ko') parts.push(`계약 수는 풋이 콜의 ${r.pcr.toFixed(1)}배인데, 돈은 콜 쪽에 ${dollarRatio.toFixed(1)}배 들어갔다`);
    else if (LOCALE === 'ja') parts.push(`枚数はプットがコールの${r.pcr.toFixed(1)}倍、しかし金額はコールに${dollarRatio.toFixed(1)}倍`);
    else parts.push(`Puts outnumber calls ${r.pcr.toFixed(1)}:1 by contracts, but calls carry ${dollarRatio.toFixed(1)}x the dollars`);
  } else if (r.pcr && r.pcr > 1.3) {
    if (LOCALE === 'ko') parts.push(`풋이 콜보다 ${r.pcr.toFixed(1)}배 많이 거래됐다`);
    else if (LOCALE === 'ja') parts.push(`プットがコールの${r.pcr.toFixed(1)}倍`);
    else parts.push(`Puts trading ${r.pcr.toFixed(1)}x calls`);
  } else if (r.pcr && r.pcr < 0.8) {
    if (LOCALE === 'ko') parts.push(`콜이 풋보다 ${(1/r.pcr).toFixed(1)}배 많이 거래됐다`);
    else if (LOCALE === 'ja') parts.push(`コールがプットの${(1/r.pcr).toFixed(1)}倍`);
    else parts.push(`Calls trading ${(1/r.pcr).toFixed(1)}x puts`);
  }
  if (r.mp && r.px) {
    const gap = ((r.mp - r.px) / r.px) * 100;
    const dir = gap >= 0 ? 'above' : 'below';
    if (Math.abs(gap) >= 1) {
      if (LOCALE === 'ko') parts.push(`맥스페인은 현재가보다 ${Math.abs(gap).toFixed(1)}% ${gap >= 0 ? '위' : '아래'}`);
      else if (LOCALE === 'ja') parts.push(`マックスペインは現在値より${Math.abs(gap).toFixed(1)}%${gap >= 0 ? '上' : '下'}`);
      else parts.push(`Max pain sits ${Math.abs(gap).toFixed(1)}% ${dir} spot`);
    }
  }
  return parts.join(LOCALE === 'en' ? '. ' : ' · ');
}

const fs = require('fs');
const pathm = require('path');
const LOGO_DIR = '/tmp/reel-logos';
// 로고는 «배경»으로도 쓰므로 반드시 있어야 한다. 로컬 자산 → 없으면 프록시.
async function logoFor(t) {
  try {
    fs.mkdirSync(LOGO_DIR, { recursive: true });
    const local = pathm.join(__dirname, '..', 'public', 'shorts', 'logos', `${t}.png`);
    if (fs.existsSync(local)) return local;
    const cached = pathm.join(LOGO_DIR, `${t}.png`);
    if (fs.existsSync(cached)) return cached;
    const r = await fetch(`https://www.signumhq.com/api/logo/${t}`);
    if (!r.ok) return '';
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length < 200) return '';
    fs.writeFileSync(cached, b);
    return cached;
  } catch { return ''; }
}

(async () => {
  const rows = [];
  for (const t of UNIVERSE) {
    try {
      const k = await fetch(`https://www.signumhq.com/api/live/ticker?t=${t}&skip_alpha=1&_cb=${Date.now()}`).then(r => r.json());
      const f = k?.flow; if (!f?.totalPremium) continue;
      rows.push({ t, prem: f.totalPremium, call: f.callPremium || 0, put: f.putPremium || 0,
                  pcr: Number(f.volumePcr) || null, mp: Number(f.maxPain) || null,
                  px: Number(k.price) || null, chg: (Number(k.changePct) || 0) * 100,
                  name: k.companyName || '' });
    } catch {}
  }
  rows.sort((a, b) => b.prem - a.prem);
  const top = rows.slice(0, TOP);
  for (const r of top) r.logo = await logoFor(r.t);
  // ⚠️ 제목의 숫자는 «실제 카드 수»여야 한다. 5종목을 못 채웠는데 「TOP 5」라고
  //    쓰면 그게 곧 거짓 라벨이다(조용히 틀리는 대표 유형).
  const RANK_TITLE = T.ranking.replace('{N}', String(top.length));
  if (top.length < 3) { console.error('데이터 부족 — 스펙을 만들지 않는다'); process.exit(2); }

  const scenes = [{ mode: 'card', seconds: 2.6, symbol: T.title.length > 18 ? '' : '',
                    rank: '', caption: `${T.title} — ${T.hookCap}`, foot: T.foot }];
  // 훅은 심볼 대신 제목을 크게
  scenes[0].symbol = `TOP ${top.length}`;
  scenes[0].ranking = RANK_TITLE;
  scenes[0].rankingSub = T.rankingSub;

  top.slice().reverse().forEach((r, i) => {
    const rank = top.length - i;
    scenes.push({
      mode: 'card', seconds: 4.2, accent: rank === 1 ? 'amber' : 'teal',
      ranking: RANK_TITLE, rankingSub: T.rankingSub, logo: r.logo,
      rank: String(rank), rankUnit: T.rankUnit, symbol: r.t,
      symbolSub: r.name ? r.name.slice(0, 34) : '',
      price: r.px ? `$${r.px.toFixed(2)}` : '',
      change: `${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(2)}%`,
      stats: [
        { l: T.prem, v: money(r.prem) },
        { l: T.pcr, v: r.pcr ? r.pcr.toFixed(2) : '—' },
        { l: T.mp, v: r.mp ? `$${r.mp}` : '—' },
      ],
      split: { call: r.call, put: r.put,
               callLabel: `${T.callL} ${money(r.call)}`, putLabel: `${money(r.put)} ${T.putL}` },
      // 순위 사다리 — 「랭킹느낌」. 지금 몇 위를 보고 있는지가 매 컷에 보인다.
      ladder: top.map((x, j) => ({ r: j + 1, s: x.t, v: money(x.prem),
                                    on: x.t === r.t, hide: (j + 1) < rank })),
      caption: caption(r), foot: T.foot,
    });
  });

  if (FRAMES) scenes.push({ seconds: 5.0, kicker: T.sub, lines: [T.appCap], frames: FRAMES, foot: T.foot });
  scenes.push({ mode: 'card', seconds: 2.8, accent: 'amber', symbol: 'SIGNUM', symbolSub: T.cta,
                caption: T.foot, foot: T.foot });

  console.log(JSON.stringify({ app: 'signum', scenes }, null, 1));
})();
