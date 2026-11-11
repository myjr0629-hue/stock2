import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPostLang, detectLang, parsePostInput, resolveLang } from './bsky-lang.mjs';

const samples = {
  en: ['The market is rising and the outlook is positive for investors.', 'This is the latest update on stocks and options for the week.'],
  ko: ['오늘 미국 주식 시장의 움직임을 확인하세요.', '옵션 시장에서 투자자들의 관심이 높아지고 있습니다.'],
  ja: ['今日の市場は上昇しています。', '株式市場の最新情報をお届けします。'],
  zh: ['今天市场上涨，投资者关注股票。', '美国股市最新消息，期权交易活跃。'],
  de: ['Die Aktien steigen und der Markt ist für Anleger wichtig.', 'Der Markt und die Wirtschaft sind nicht für alle gleich.'],
  fr: ['Les marchés sont en hausse et les investisseurs regardent les actions.', 'Le marché est ouvert pour les investisseurs avec une forte hausse.'],
  es: ['El mercado de valores sube y los inversores miran las acciones.', 'Los mercados están en alza y las acciones son para todos.'],
  pt: ['O mercado de ações está em alta e os investidores acompanham os preços.', 'As ações são para os investidores e não para o mercado de opções.'],
  it: ['Il mercato delle azioni è in crescita e gli investitori sono attenti.', 'Le azioni sono in rialzo e il mercato non è più stabile.'],
};
for (const [lang, texts] of Object.entries(samples)) {
  for (const text of texts) test(`${lang}: ${text}`, () => assert.equal(detectLang(text), lang));
}
test('애매한 입력과 동점은 영어로 처리', () => {
  for (const text of ['', 'NVDA 123', 'de', 'https://example.com/der/die']) assert.equal(detectLang(text), 'en');
});
test('명시한 소문자 BCP-47 태그가 판별보다 우선', () => {
  assert.equal(resolveLang('The market and the stocks are up', 'de'), 'de');
  assert.equal(resolveLang('오늘 시장', 'pt-br'), 'pt-br');
  assert.equal(resolveLang('오늘 시장'), 'ko');
});
test('잘못된 명시 태그는 거부', () => {
  for (const lang of ['', 'DE', 'pt_BR', null, 123]) assert.throws(() => resolveLang('text', lang));
});
test('기존 일본어 우선 및 혼합 한자 처리', () => {
  assert.equal(detectLang('한국어 日本語 かな'), 'ja');
  assert.equal(detectLang('한국어 漢字'), 'ko');
});
test('언어 판별에서 링크와 소셜 식별자 및 숫자와 기호를 제외', () => {
  for (const text of [
    'The market is rising https://example.com/日本',
    'The market is rising www.example.com/日本',
    'The market is rising @日本 #株式市場',
    'The market is rising @かな #한국어',
    'https://example.com/日本 @한국어 #かな 123 !!!',
  ]) assert.equal(detectLang(text), 'en');
  assert.equal(detectLang('今日の市場は上昇しています。 https://example.com/news'), 'ja');
  assert.equal(detectLang('今天市场上涨，投资者关注股票。 #markets 2026'), 'zh');
});
test('한자는 최소 개수와 본문 글자 비율을 충족해야 중국어로 판별', () => {
  assert.equal(detectLang('日本'), 'en');
  assert.equal(detectLang('The market is rising 日本市場'), 'en');
  assert.equal(detectLang('市场上涨'), 'zh');
  assert.equal(detectLang('市场今天在上涨 1234567890 !!!'), 'zh');
});

test('JSON 입력의 명시 언어를 게시 요청에 전달하고 기존 langs는 보존', () => {
  const input = parsePostInput('{"text":"The market and the stocks are up", "lang":"de"}');
  const body = { record: { $type: 'app.bsky.feed.post', text: input.text } };
  assert.equal(addPostLang(body, input.lang), true);
  assert.deepEqual(body.record.langs, ['de']);
  assert.equal(addPostLang(body, 'fr'), false);
  assert.deepEqual(body.record.langs, ['de']);
  const automatic = { record: { $type: 'app.bsky.feed.post', text: '오늘 시장' } };
  addPostLang(automatic, parsePostInput('{"text":"오늘 시장"}').lang);
  assert.deepEqual(automatic.record.langs, ['ko']);
  assert.equal(addPostLang({ record: { $type: 'other' } }, 'de'), false);
});
test('잘못된 JSON 입력을 거부', () => {
  for (const json of ['null', '[]', '{}', '{"text":" "}', '{"text":"hi","lang":null}', '{']) {
    assert.throws(() => parsePostInput(json));
  }
});

test('URL 바로 뒤 본문·한자만 있는 일본어(관문 11120549)', () => {
  assert.equal(detectLang('https://example.com/news。市場が上昇'), 'ja');
  assert.equal(detectLang('東京株式市場'), 'en');
  assert.equal(detectLang('米国株式投資為替経済'), 'en');
  assert.equal(detectLang('Read more https://example.com/东京市场 now and then'), 'en');
  assert.equal(detectLang('這是我們的美股財報數據'), 'zh');
});
