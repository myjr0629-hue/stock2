// ============================================================================
// _applink — 홍보 문구에 붙는 «앱 스마트링크»의 단일 출처.
//
// 왜 모듈로 빼는가 (2026-08-31 대표 지적):
//   「앱 링크를 했다 안 했다 하지 말라」. 실제로 하루 10건 중 3건만 붙었다.
//   기억에 의존하는 한 바쁜 날 또 빠진다. 그래서 문구를 만드는 모든 도구가
//   여기를 거치게 하고, 링크 없는 문구는 «만들어질 수 없게» 한다.
//
// /app 은 UA 로 분기하는 스마트링크다 — 안드로이드는 Play(install referrer 포함),
// iOS 는 App Store 로 보낸다. 그래서 설치로 바로 꽂히고 유입이 측정된다.
// ⚠️ from 태그에 하이픈을 쓰면 안 된다(FROM_RE = [a-z0-9_]). 하이픈은 조용히
//    버려져 설치 측정이 통째로 사라진다. 반드시 밑줄.
// ============================================================================
const APPS = {
    signum: 'signumhq.com/app',
    uc: 'signumhq.com/app-uc',
    wim: 'signumhq.com/app-wim',
};

const CTA = {
    en: { signum: 'Every US ticker, free, no account:', uc: 'The story behind the move, free:', wim: 'Why did it move? Free:' },
    ko: { signum: '전 종목 무료·가입 없이:', uc: '그 움직임의 이유, 무료:', wim: '왜 움직였나, 무료:' },
    ja: { signum: '全銘柄、無料・登録不要:', uc: 'その値動きの理由、無料:', wim: 'なぜ動いたか、無料:' },
};

/** 태그는 «겨냥한 시장» 기준이다(계정 국적이 아니라). */
function appLink(loc = 'en', app = 'signum', market = null) {
    const l = CTA[loc] ? loc : 'en';
    const tag = `x_${market || (l === 'ja' ? 'jp' : l === 'ko' ? 'kr' : 'us')}`;
    if (!APPS[app]) throw new Error(`알 수 없는 앱: ${app}`);
    return `${CTA[l][app]}\n${APPS[app]}?from=${tag}`;
}

/** 문구 조립의 유일한 출구. 링크를 뺄 수 있는 경로를 남기지 않는다. */
function composePost(bodyLines, { loc = 'en', app = 'signum', market = null, source = null } = {}) {
    const body = (Array.isArray(bodyLines) ? bodyLines : [bodyLines]).filter(Boolean).join('\n');
    if (!body.trim()) throw new Error('본문이 비었다');
    return [body, source, appLink(loc, app, market)].filter(Boolean).join('\n\n');
}

module.exports = { appLink, composePost, APPS };
