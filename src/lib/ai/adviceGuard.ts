/**
 * 권유어 가드 (2026-10-14) — «시장을 서술하는 말»과 «사고팔라는 말»을 가른다. 순수 함수만(네트워크·Redis 없음).
 *
 * 왜: 푸시 «AI 한 줄»의 금지어 가드(lib/push/aiLine.bannedHit)가 «買い·売り·매수·매도·buying·selling» 글자만 보고 막았다.
 *   10/13 모닝 푸시 일본어 본문이 정적 문구로 나갔다(banned:売り) — 글은 «半導体に売りが集中している»,
 *   즉 누가 팔고 있는지 서술한 말이지 권유가 아니었다. 실제 AI 글 코퍼스(DEPTH-2026-10-11)로 재 보니
 *   모닝 브리핑 첫 문장의 일본어 16.4%·한국어 6.3% 가 이렇게 오탐이었다.
 *
 * 원칙 (대표 10/14): 권유·명령·평가(등급)는 계속 막고, 시장 서술은 통과시킨다.
 *   · 막는다  — 売るべき · 売り推奨 · 買い時 · 今すぐ売 · 매수하세요 · 매수 추천 · 매수 의견 · buy now · should sell · strong buy …
 *   · 통과    — 売り優勢 · 売り圧力 · 売りが集中 · 空売り · 自社株買い · 매수세 · 매도 압력 · 순매수 · 공매도 · selling pressure · sell-off · net buying …
 *   · 모르는 모양은 «막는다» — 통과 목록은 닫힌 목록이다(예전과 같은 쪽으로 실패). 바뀐 것은 «덜 막는» 닫힌 목록과,
 *     예전엔 글자가 없어 놓치던 권유(売るべき · 今すぐ売る · 사세요)를 «더 막는» 틀뿐이다.
 *
 * 순서
 *   ① 서술 복합어(空売り · 매수세 · sell-off …)를 자리 표시로 바꾼다
 *   ② 권유 틀(HARD) — ①을 거친 글에 건다. 서술 명사 뒤에 권유가 이어져도(«매수세에 올라타세요») 잡는다
 *   ③ 서술로 쓰인 명사(売りが集中 · 매수가 몰리며 · broad-based buying)를 자리 표시로 바꾼다
 *   ④ 남은 글에 예전 금지어(BASE)를 건다 — 남은 買い/売り/매수/매도/buy/sell 은 모두 막힌다
 *
 * 세 언어 패턴을 모든 로케일 글에 다 건다(한국어 글에 영어 문장이 섞여도 잡는다).
 * 시험: tests/adviceGuard.test.ts (막아야 할 문장·통과할 문장 표 + 실제 AI 글 코퍼스 대조)
 */

// 자리 표시 — 어떤 패턴에도 걸리지 않는 문자(앞뒤 낱말이 붙어 새 낱말이 되지 않게 구분자 역할)
const HOLE = '\u0001';
const swap = (t: string, res: RegExp[]): string => res.reduce((s, re) => s.replace(re, HOLE), t);
// 일본어 «テック買い時» 처럼 서술 복합어 바로 뒤에 평가·권유 말이 이어지면 복합어로 치지 않는다
const JA_ADV_TAIL = '(?!(?:を|が|は|に|の|も)?(?:時|どき|場|目|増し|転換|シグナル|サイン|推奨|判断|評価|格上げ|格下げ|レーティング|格付|意見|目線|ゾーン|チャンス|好機|タイミング|妥当|有利|有望|狙い|おすすめ|お勧め|オススメ|推し|検討|急|進め|増や|強め|優先|継続すべき|べき))';
// 한국어 «기관 매수 등급» 처럼 서술 복합어 바로 뒤에 평가·권유 말이 이어지면 복합어로 치지 않는다(그 매수는 아래 권유 틀이 본다)
const KO_ADV_TAIL = '(?!\\s?(?:등급|의견|투자의견|추천|리포트|업그레이드|상향|하향|전략|기회|타이밍|시점|구간|신호|시그널|포인트|관점|고려|검토|권유))';

// ─────────────────────────────────────────────────────────────────────────────
// 0) 예전 금지어 — 투자 권유·목표가·예측으로 읽힐 수 있는 말(aiLine.ts 에 있던 목록)
//    일본어 «買え|売れ» 는 뺐다: 명령형은 아래 HARD 가 문장 끝 모양으로 잡는다(売れ行き · 売れ筋 · 買える 를 막지 않게)
// ─────────────────────────────────────────────────────────────────────────────
const BASE: RegExp[] = [
  /매수|매도|추천|목표\s?주?가|예측|전망|손절|익절|팔아라|담아라/,   // «사라»(사라지다)는 서술에 흔해 넣지 않는다
  /\b(?:buy|buys|buying|sell|sells|selling|recommend\w*|price\s+target|target\s+price|predict\w*|forecast\w*|outperform\w*|underperform\w*|upgrade[sd]?|downgrade[sd]?|guarantee[sd]?)\b/i,
  /買い|売り|推奨|目標株価|目標価格|予測|予想|見通し/,
];

// ─────────────────────────────────────────────────────────────────────────────
// ① 서술 복합어 — 그 자체가 «누가 무엇을 하고 있다 / 지표 이름 / 회사 가이던스»인 말
// ─────────────────────────────────────────────────────────────────────────────
const COMPOUND_OK: RegExp[] = [
  // ── 일본어 ──
  /空売り|自社株買い|自己株買い|株買い|買い戻し|買い集め|売り抜け|売り上げ|売り出し|売り切れ|売り気配|買い気配|売り手|買い手|売り方|買い方|売り越し|買い越し|売り買い|売り注文|買い注文|買い入れ|買い付け|買い取り/g,
  // 누가·무엇을 사고파는가(내부자売り · コール買い · 債券売り · 純売り) — 뒤에 평가·권유가 이어지면 제외
  new RegExp(`(?:インサイダー|内部者|大口|機関|海外勢|個人|外国人|コール|プット|債券|株式?|現物|先物|ドル|円|テック|ハイテク|新規|純|防御的な?|選別(?:的な?)?|循環|半導体|チップ)(?:の)?(?:買い|売り)${JA_ADV_TAIL}`, 'g'),
  /(?:買い|売り)\s?\d/g,
  // 予想: 지표 이름(予想益回り · 予想PER) · 컨센서스와의 비교(予想を上回る) · 회사 가이던스(業績予想) · 예상 밖/대로
  /予想(?:益回り|PER|EPS|配当|株価収益率)/g,
  /(?:業績|通期|連結|売上|利益|配当|決算|市場|コンセンサス)予想/g,
  /予想(?:を|は|より|に対し)(?:大きく)?(?:上回|下回|裏切|超え)|予想(?:外|通り|どおり|以上|以下|比)/g,
  // 見通し: 회사 가이던스(売上見通し · 通期見通し) · 가이던스를 «다시 확인/상향» 같은 회사의 행동
  /(?:売上|業績|利益|通期|連結|収益|増益|減益|配当|ガイダンス|会社|決算)見通し/g,
  /見通し(?:を)?(?:再確認|維持|据え置|引き上げ|引き下げ|上方修正|下方修正|確認|発表|公表|開示)/g,
  // ── 한국어 ──
  /(?:순|공)?매[수도]세/g,
  /공매도|순매[수도]/g,
  /매[수도]\s?\d/g,                                   // «매수 0, 매도 5» · «매도 26건»
  /매[수도]\s?(?:우위|압력|물량|주체|규모|강도|흐름|유입|유출|신고|신청|공시|내역|대금|금액|비중|호가|잔량|상위|하위|심리|주문|자금|수급|움직임|동향|속도|여력|증가|감소|확대|축소|둔화)/g,
  new RegExp(`(?:콜|풋|콜옵션|풋옵션|옵션)\\s?매[수도]${KO_ADV_TAIL}`, 'g'),
  new RegExp(`(?:내부자|임원|대주주|최대주주|기관|외국인|개인|고래|펀드|딜러)\\s?(?:의\\s?)?매[수도]${KO_ADV_TAIL}`, 'g'),
  new RegExp(`(?:순환|선별적?|광범위한?|폭넓은|전반적|전방위|일방적)\\s?매[수도]${KO_ADV_TAIL}`, 'g'),
  // 전망: 회사 가이던스·컨센서스 수치·전망을 «다시 확인» 하는 회사의 행동(시장 전망은 계속 막는다)
  /(?:매출|실적|이익|영업이익|수익|가이던스|연간|분기|EPS|배당)\s?전망(?:치)?|전망치/g,
  /전망(?:치)?\s?(?:을\s?)?(?:재확인|유지)/g,
  // ── 영어 ──
  /sell-?offs?\b/gi,
  /\b(?:buy|sell)[- ]side\b/gi,
  /\bbuy[- ]now,?\s+pay[- ]later\b/gi,
  /\b(?:buy|sell)[- ]to[- ](?:open|close)\b/gi,
  /\bbuy-the-dip\b|\bdip[- ]buying\b/gi,
  /\b(?:out|under)perform(?:ed|s|ing|ance)\b/gi,
  // 딜러 헤지 서술(«sell into rallies and buy into dips») — 앞에 권유 틀(should · 명령형)이 있으면 ②의 RAW 틀이 먼저 잡는다
  /\b(?:buy|sell)\s+(?:into\s+)?(?:rallies|rally|dips?|strength|weakness|declines?|gains?|losses?|pullbacks?|spikes?)\b/gi,
  // 회사·주주의 공시 행동(«filed to sell $347M of stock»)
  /\b(?:filed|files|filing|plans?|planned|agreed|agrees|moves?|moved|seeks?|sought|intends?|intended|proposes?|proposed|announced|announces|offered|offers|looks|looking)\s+to\s+(?:buy|sell)\b/gi,
  // 주체가 제3자인 서술(«investors buy», «insiders sell») — 사이에 should 같은 권유 틀이 끼면 이 패턴이 안 맞아 ②가 잡는다
  /\b(?:investors?|traders?|institutions?|funds?|dealers?|insiders?|whales?|retail|speculators?|shareholders?|holders?|executives?|directors?|buyers|sellers|bulls|bears|participants?|market\s+makers?|hedgers?|people|some|many|most)\s+(?:also\s+|still\s+|only\s+|now\s+|simply\s+|largely\s+|are\s+|were\s+|have\s+been\s+)?(?:buy|sell)\b/gi,
];

// ─────────────────────────────────────────────────────────────────────────────
// ② 권유 틀 — 명사로 쓰인 買い/売り/매수/매도 라도, 또는 글자 없이도 권유·명령·평가면 막는다
//    (예전엔 売るべき · 買うべき · 今すぐ売る · 사세요 가 목록에 글자가 없어 통과했다 — 대표 10/14 «계속 막는다» 대상)
// ─────────────────────────────────────────────────────────────────────────────
const JA_STEM = '(?:買い|売り|買う|売る|買わ|売ら|買っ|売っ)';

/** 원문에 그대로 거는 틀 — 서술 복합어가 삼키지 못하게(«should buy dips» 의 buy dips 는 복합어이기도 하다) */
const HARD_RAW: RegExp[] = [
  // ── 일본어 ──
  /[買売](?:う|る)(?:べき|べし|ほうが|方が|のが|のも手)/,                                          // 買うべき 売るべき 売るほうが
  /[買売]っ(?:た方が|たほうが|てください|てくれ|ておく|ておこう|ても(?:良|よ|いい)|てはいけ)/,        // 売った方が 買ってください
  /買いましょう|売りましょう|買おう|売ろう|買えば(?:良|よ|いい)|売れば(?:良|よ|いい)/,                // 買いましょう 売ろう
  /今すぐ[^。、，,！!]{0,6}[買売]/,                                                               // 今すぐ売 今すぐ買い
  /(?:買え|売れ)(?=[。！!」]|$)/,                                                                  // 명령형(문장 끝) — 売れ行き · 売れ筋 · 売れ、 는 아님
  // ── 한국어 ──
  /사세요|사십시오|파세요|담으세요|올라타(?:세요|라|자)/,                                           // 글자 없이 사고팔라는 말(팔아라·담아라는 BASE)
  // ── 영어 ──
  /\b(?:should|must|ought\s+to|needs?\s+to|had\s+better|let'?s|time\s+to|(?:good|best|right|perfect)\s+time\s+to)\s+(?:\w+\s+)?(?:buy|sell)\b/i,
  /\b(?:consider(?:ing)?|worth|avoid(?:ing)?|(?:good|best|right|perfect)?\s*time\s+for)\s+(?:buying|selling|a\s+buy|a\s+sell)\b/i,
  // 명령형 «Buy the dip» — 문장 첫머리의 Sell-off · Buy-side · Buy now pay later 는 명령이 아니다
  /(?:^|[.!?;:]\s+)(?:please\s+)?(?:buy|sell)(?![-\w])(?!\s+(?:side\b|now,?\s+pay|to[- ](?:open|close)\b))/i,
];

/** 서술 복합어를 치운 글에 거는 틀 */
const HARD_SWAPPED: RegExp[] = [
  // ── 일본어 ──
  new RegExp(`${JA_STEM}[^。！!？?]{0,12}(?:ください|ましょう|べき|べし)`),                           // 買いを検討してください · 売りを急ぐべき
  /(?:買い|売り)(?:時|どき|場|目|増し|転換|シグナル|サイン|推奨|判断|評価|格上げ|格下げ|レーティング|格付|意見|目線|ゾーン|チャンス|好機|タイミング|妥当|有利|有望|狙い|おすすめ|お勧め|オススメ|推し|検討)/, // 買い時 売りシグナル 買い格上げ
  /(?:買い|売り)の(?:シグナル|サイン|タイミング|チャンス|好機|時|推奨)/,                            // 売りのシグナル
  /(?:買い|売り)(?:を|が|は|も)(?:検討|推奨|おすすめ|お勧め|勧め|狙|急|妥当|有利|有望|吉|正解|得策|賢明|無難|必須)/, // 買いを検討 · 買いが妥当
  /(?:買い|売り)と(?:判断|見る|みる|いえ|言え|される|思|断|結論)/,                                  // 買いと判断
  /(?:買い|売り)(?:に|へ)(?:格上げ|格下げ|引き上げ|引き下げ|変更|修正|転換|据え置き)/,                // 買いに格上げ
  // ── 한국어 ──
  /매[수도]\s?(?:하세요|하십시오|하십시요|하라|해라|하자|합시다|해야|해\s?볼|해볼|할\s?만|할만|할\s?시점|할\s?타이밍|할\s?때|하는\s?(?:게|것이?)\s?(?:좋|유리|바람직|낫)|하면\s?좋|를\s?권|을\s?권|해도\s?좋|하기\s?좋)/,
  /매[수도]\s?(?:추천|권유|의견|등급|투자의견|리포트|업그레이드|상향|하향|강력|기회|적기|타이밍|시점|구간|신호|시그널|포인트|관점|고려|검토|유망|매력|전략|제안|유리|바람직|비추|자제|보류|금물|지양|서두|신중|분할|눌림|저점|물타기)/,
  /매[수도](?:를|을|가|이|는|은|에)\s?(?:고려|검토|추천|권유|권하|권장|노려|노리|서두|자제|피하|삼가|보류|답|정답|옳|맞|유리|최선|좋|낫|바람직|현명|필요)/,
  /매[수도][가-힣\s]{0,8}(?:세요|십시오|하라|해라|합시다)/,                                        // 매수에 나서세요 · 매수를 서두르세요
  /(?:지금|당장|바로|즉시|오늘|분할|추격|저점|눌림목|물타기|적극)\s?(?:매수|매도)(?!세)/,
  // ── 영어 ──
  /\b(?:buy|sell)\s+(?:now|today|immediately|aggressively|more|less|it|them|this|these|those|the\s+dip|on\s+(?:dips?|weakness|strength|pullbacks?))\b/i,
  /\b(?:buying|selling)\s+(?:is|looks|seems|appears|makes|remains|would\s+be|may\s+be|could\s+be)\s+(?:\w+\s+)?(?:attractive|wise|sensible|prudent|smart|justified|warranted|sense|appealing|advisable|recommended|favorable|compelling|better|best|good|great)\b/i,
  /\b(?:strong|moderate)[- ](?:buy|sell)\b|\b(?:buy|sell)\s+(?:rating|ratings|signal|signals|alert|alerts|recommendation|zone|zones)\b/i,
  /\b(?:is|are|as|rated|rating)\s+(?:a\s+|an\s+)?(?:buy|sell)\b/i,                               // «is a buy» · «rated Buy»
  /\b(?:upgrad\w+|downgrad\w+|initiat\w+|reiterat\w+)\s+(?:to|at|with)\s+(?:a\s+)?(?:strong\s+)?(?:buy|sell)\b/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// ③ 서술로 쓰인 명사 — «누가 사고 팔고 있다»(권유가 아닌 모양). 권유 틀은 ②에서 이미 걸렀다.
// ─────────────────────────────────────────────────────────────────────────────
const NOUN_FLOW: RegExp[] = [
  // 일본어: 買い/売り + 조사·구두점·서술 명사(優勢 · 先行 · 圧力 …). «買いです/買いだ» 같은 평가형은 여기 없다 → 막힌다
  /(?:買い|売り)(?=[がをにもはのと、。，,.\s)）」』]|で(?=は|も|始|推移|終|スタート|引け|寄り|寄付|幕|反応|動|進|開)|$|より|優勢|先行|圧力|一巡|一服|一色|地合|主導|中心|材料|観測|継続|拡大|加速|集中|殺到|優位|心理|需要|懸念|警戒|余波|ムード|意欲|支え)/g,
  // 한국어: 매수/매도 + 주격·목적격·보조사(조사 뒤가 한글이면 다른 낱말 — «매수가격» 은 아님) · 했다/하고 있다/한 뒤
  /매[수도](?=(?:가|이|를|을|도|는|은|에|와|과)(?![가-힣])|인지|보다)/g,
  /매[수도](?:했|한\s?(?:뒤|후|것)|하고\s?있)/g,
  // 영어: 동명사·복수(buying · selling · buys · sells) — 명사/3인칭 서술. 권유 틀(consider buying · worth selling …)은 ②에서 잡았다
  /\b(?:buying|selling|buys|sells)\b/gi,
];

/** 경제지표 «정의문» 전용의 더 엄한 정책. 서술 허용 정책(adviceHit)과 구분하며 기존 판정은 그대로 보존한다. */
const DEFINITION_FORBIDDEN = /\b(?:will|should|could|may|might|likely|expect\w*|forecast\w*|predict\w*|buy|sell|recommend\w*|bullish|bearish)\b|예측|전망|예상|매수|매도|추천|강세|약세|수\s?있습니다|予測|見通し|予想|買い|売り|推奨|強気|弱気|可能性/i;
export function definitionForbiddenHit(text: string): boolean {
  return DEFINITION_FORBIDDEN.test(text);
}

/** 걸린 권유어(첫 번째) — 없으면 null. 반환값은 «글에서 걸린 조각»(통계·로그의 banned:<조각>). */
export function adviceHit(text: string): string | null {
  const raw = String(text || '');
  for (const re of HARD_RAW) {
    const m = raw.match(re);
    if (m) return m[0].trim();
  }
  const t1 = swap(raw, COMPOUND_OK);
  for (const re of HARD_SWAPPED) {
    const m = t1.match(re);
    if (m) return m[0].split(HOLE).join('').trim() || m[0];
  }
  const t2 = swap(t1, NOUN_FLOW);
  for (const re of BASE) {
    const m = t2.match(re);
    if (m) return m[0];
  }
  return null;
}
