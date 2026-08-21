// ============================================================================
// _demand — 「검색 수요표」와 「티커 사전」을 «언어별»로 내준다
// ----------------------------------------------------------------------------
// ⛔ 왜 (2026-08-21)
//   게이트가 .agent/DEMAND.json «하나»만 봤다. 그 표는 영어 문구뿐이라,
//   일본어 제목은 무조건 「수요 어휘 없음 · 소재 수요 0」으로 떨어졌다.
//   실제로는 マックスペイン 이 소형중앙 15,560 으로 우리가 잰 것 중 최상위인데도.
//
// ⛔ 두 표의 «자»가 같아야 한다
//   DEMAND.json / DEMAND_JA.json 모두 값은 «소형채널(구독 10만 미만) 조회 중앙»이다.
//   원시 조회 중앙과 섞으면 08-21 의 «금 84,262 vs 실제 256» 사건이 그대로 재발한다.
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';

const FILES = {
  en: '.agent/DEMAND.json',
  ja: '.agent/DEMAND_JA.json',
};

const cache = {};

/** 그 언어의 수요표 { terms, homonyms }. 없으면 빈 표. */
export function demandFor(lang = 'en') {
  const key = String(lang || 'en').toLowerCase();
  if (cache[key]) return cache[key];
  const f = FILES[key] ?? FILES.en;
  const d = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  cache[key] = { terms: d.terms || {}, homonyms: d.homonyms || {} };
  return cache[key];
}

// ⛔ 일본어 대본·제목은 종목을 «가타카나 사명»으로 쓴다. 영문 심볼 사전으로는 안 걸린다.
const TICKER_EN = /\b(AMD|NVDA|Nvidia|Micron|MU|SanDisk|SNDK|Broadcom|AVGO|Walmart|Meta|Google|Apple|Tesla|Intel|Samsung|Hynix|Amazon|Microsoft|Netflix|Palantir|GLD|SPY|QQQ|TSLA|AAPL|MSFT|AMZN|GOOGL|IBIT|UUP|SLV|GDX|SMH|XLU|TLT|IEF|COIN|SMCI)\b/i;
const TICKER_JA = /(エヌビディア|テスラ|アップル|マイクロン|ブロードコム|アマゾン|グーグル|マイクロソフト|メタ|インテル|パランティア|ネットフリックス|サンディスク|NVDA|AMD|TSLA|AAPL|MSFT|AMZN|SPY|QQQ)/;

/** 그 언어에서 «종목명»을 찾는 정규식 */
export function tickerRe(lang = 'en') {
  return String(lang || 'en').toLowerCase() === 'ja' ? TICKER_JA : TICKER_EN;
}

// ⛔ 「무료」는 언어를 따라간다. 일본어 설명에 FREE 를 박으면 그 줄만 영어가 된다.
const FREE_EN = /\bfree\b/i;
const FREE_JA = /(無料|むりょう)/;

/** 그 언어에서 «무료»를 뜻하는 표현 */
export function freeRe(lang = 'en') {
  return String(lang || 'en').toLowerCase() === 'ja' ? FREE_JA : FREE_EN;
}
