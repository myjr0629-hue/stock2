/**
 * 구글봇 head 메타데이터 시험 — next.config.mjs 의 htmlLimitedBots
 * 실행: node tests/headMetadataBots.test.mjs
 *
 * 지키는 것:
 *  1) 구글봇(스마트폰·데스크톱·옛 UA·이미지)은 목록에 «든다» → canonical·hreflang·title 이 <head> 안으로 간다
 *  2) Next 기본 목록(빙·트위터·슬랙·페이스북·네이버 Yeti·Search Console 실시간 테스트)은 «그대로» 든다
 *  3) 사람(브라우저·인앱 브라우저·우리 앱 웹뷰)은 «안 든다» → 사용자 화면은 스트리밍 그대로(속도 무변경)
 *  4) Next 가 서버에서 쓰는 방식(source 문자열 + 'i')으로 다시 만들어도 같은 판정
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const config = (await import('../next.config.mjs')).default;
const re = config.htmlLimitedBots;
assert.ok(re instanceof RegExp, 'htmlLimitedBots 는 RegExp 여야 한다(Next 설정 스키마: z.instanceof(RegExp))');

// Next 서버는 RegExp 를 source 문자열로 바꿔 두었다가 new RegExp(s, 'i') 로 쓴다(server/lib/streaming-metadata.js).
const asServer = new RegExp(re.source, 'i');

const nextDefault = createRequire(import.meta.url)('next/dist/shared/lib/router/utils/html-bots').HTML_LIMITED_BOT_UA_RE;
assert.ok(re.source.includes(nextDefault.source), 'Next 기본 목록을 통째로 품어야 한다(링크 미리보기 봇 보호)');

const BOTS = {
  'Googlebot 스마트폰': 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.89 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Googlebot 데스크톱': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/129.0.6668.89 Safari/537.36',
  'Googlebot 옛 UA': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
  'Googlebot-Image': 'Googlebot-Image/1.0',
  'Search Console 실시간 테스트': 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)',
  'AdSense': 'Mediapartners-Google',
  'Bingbot': 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Twitterbot': 'Twitterbot/1.0',
  'Slackbot': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  'Facebook': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  '네이버 Yeti': 'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)',
};
const PEOPLE = {
  '아이폰 사파리': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  '맥 크롬': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  '안드로이드 크롬': 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  '삼성 인터넷': 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  '카카오톡 인앱': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5',
  '네이버 앱': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.10.2)',
  '구글 앱(iOS)': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/372.0.740 Mobile/15E148 Safari/604.1',
  '인스타그램 인앱': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0',
  '우리 앱 iOS 웹뷰': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  '우리 앱 안드로이드 웹뷰': 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36',
  '파이어폭스': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  '엣지': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
};

let n = 0;
for (const [name, ua] of Object.entries(BOTS)) {
  assert.ok(re.test(ua), `봇인데 head 목록 밖: ${name}`);
  assert.ok(asServer.test(ua), `서버 방식(source+i)에서 봇인데 목록 밖: ${name}`);
  n++;
}
for (const [name, ua] of Object.entries(PEOPLE)) {
  assert.ok(!re.test(ua), `사람인데 head 목록 안(스트리밍을 잃는다): ${name}`);
  assert.ok(!asServer.test(ua), `서버 방식에서 사람인데 목록 안: ${name}`);
  n++;
}
console.log(`✅ headMetadataBots: ${n}건 통과 (봇 ${Object.keys(BOTS).length} · 사람 ${Object.keys(PEOPLE).length})`);
