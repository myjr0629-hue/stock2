// 언어별 기능어와 특징적인 악센트로 짧은 게시물의 언어를 추정한다.
const words = {
  de: 'der die das den dem des und ist sind ein eine einer einen mit für auf nicht von zu im sich auch bei',
  fr: 'le la les un une des du de et est sont dans pour avec sur pas que qui vous ce cette aux au',
  es: 'el la los las un una unos unas de del y es son en para con por que se como más',
  pt: 'o a os as um uma uns umas de do da dos das e é são em para com por que não mais',
  it: 'il lo la gli le un una uno di del della e è sono in per con che non più nel al',
  en: 'the a an and is are in for with on of to that this it as not from by at will',
};
const dictionaries = Object.fromEntries(Object.entries(words).map(([lang, list]) => [lang, new Set(list.split(' '))]));
const accents = {
  de: /[äöüß]/gu, fr: /[àâçéèêëîïôùûüÿœ]/gu,
  es: /[áéíóúüñ¿¡]/gu, pt: /[áâãàçéêíóôõú]/gu, it: /[àèéìíîòóù]/gu,
};

export function detectLang(text) {
  // 링크와 소셜 식별자는 본문 언어의 근거에서 제외한다.
  const clean = text.toLowerCase()
    .replace(/(?:https?:\/\/|www\.)[^\s]+/gu, ' ')
    .replace(/[@#][\p{L}\p{M}\p{N}_.-]+/gu, ' ')
    .replace(/[^\p{L}\p{M}\s]/gu, ' ');
  // 기존 일본어 우선순위를 유지한다(일본어에는 한자가 함께 쓰인다).
  if (/[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]/u.test(clean)) return 'ja';
  if (/\p{Script=Hangul}/u.test(clean)) return 'ko';
  const hanCount = (clean.match(/\p{Script=Han}/gu) || []).length;
  const letterCount = (clean.match(/\p{L}/gu) || []).length;
  if (hanCount >= 3 && hanCount / letterCount >= 0.5) return 'zh';
  const tokens = clean.match(/\p{Script=Latin}+/gu) || [];
  const scores = Object.fromEntries(Object.keys(words).map((lang) => [lang, 0]));
  for (const token of tokens) {
    for (const lang of Object.keys(words)) if (dictionaries[lang].has(token)) scores[lang]++;
  }
  for (const [lang, pattern] of Object.entries(accents)) scores[lang] += (clean.match(pattern) || []).length;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] >= 2 && ranked[0][1] - ranked[1][1] >= 2 ? ranked[0][0] : 'en';
}

export function resolveLang(text, lang) {
  if (lang === undefined) return detectLang(text);
  if (typeof lang !== 'string' || !lang || lang !== lang.toLowerCase()) throw new Error('lang 은 소문자 BCP-47 언어 태그여야 한다');
  try {
    if (Intl.getCanonicalLocales(lang).length !== 1) throw new Error();
  } catch {
    throw new Error('lang 은 소문자 BCP-47 언어 태그여야 한다');
  }
  return lang;
}

export function parsePostInput(json) {
  const input = JSON.parse(json);
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.text !== 'string' || !input.text.trim()) {
    throw new Error('JSON 입력에는 비어 있지 않은 text 문자열이 필요하다');
  }
  if (Object.hasOwn(input, 'lang')) resolveLang(input.text, input.lang);
  return input;
}

export function addPostLang(body, lang) {
  if (body && body.record && body.record.$type === 'app.bsky.feed.post' && !body.record.langs) {
    body.record.langs = [resolveLang(body.record.text || '', lang)];
    return true;
  }
  return false;
}
