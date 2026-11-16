/**
 * 2026-11-16 «주식 전반을 아우르는 앱» 문구 교체(linkPreview 카드 SIGNUM 제목·설명 + 프로모·초대 카드 끝 한 줄).
 * 옛 커밋·origin/main 을 «바이트 동일» 기준으로 읽는 회귀 시험들이 의도한 문구 변경 때문에 깨지지 않도록,
 * 기준 소스에 같은 문구 치환만 적용한다(날짜·한도·canonical·캠페인 등 시험 대상 로직은 그대로 비교된다).
 * 이미 새 문구인 소스에서는 아무것도 바뀌지 않는다.
 */
export const CARD_COPY_1116: ReadonlyArray<readonly [string, string]> = [
  ['SIGNUM HQ — the whole US market in one free app', 'SIGNUM HQ — stock market app: real-time prices & AI analysis'],
  ['Premarket movers, earnings calendar, macro & rates, sector heatmap, an AI brief every morning, and institutional footprints (options, dark pool, short volume). Free on iOS & Android, no account needed.',
    'Real-time prices for your US stocks (regular hours), a one-line AI read on what is moving them, market news, a morning AI brief, a closing report, the earnings calendar and alerts. Free on iOS & Android, no account needed.'],
  ['SIGNUM HQ — 米国市場のすべてを、無料アプリひとつで', 'SIGNUM HQ — 米国株アプリ｜株価リアルタイム・AI分析'],
  ['プレマーケット・決算カレンダー・マクロ・セクター・毎朝のAI要約・機関投資家の足跡（オプション・ダークプール・空売り）。iOS・Android 無料、登録不要。',
    'マイ銘柄の株価をリアルタイムで（通常取引時間）、株価を動かしている材料をAIが一行で。ニュース・朝のAIブリーフ・引け後レポート・決算日程・通知。iOS・Android 無料、登録不要。'],
  ['SIGNUM HQ — 미국 시장 전체를 무료 앱 하나로', 'SIGNUM HQ — 미국주식 앱: 실시간 주가·AI 분석'],
  ['프리마켓·실적 일정·거시·섹터·매일 아침 AI 브리핑·기관의 흔적(옵션·다크풀·공매도). iOS·Android 무료, 가입 없이 바로.',
    '내 종목 실시간 주가(정규장), 지금 내 종목을 움직이는 요인을 AI가 한 줄로. 미국 증시 뉴스·아침 AI 브리핑·장마감 리포트·실적 일정·알림. iOS·Android 무료, 가입 없이 바로.'],
  [' Options flow & dark pool data app.', ' US stock app: market-hours live prices & AI analysis.'],
  ['オプションフロー/ダークプールのアプリ。', '通常取引時間のリアルタイム株価とAI分析の米国株アプリ。'],
  [' 옵션 흐름·다크풀 데이터 앱.', ' 정규장 실시간 주가·AI 분석 미국주식 앱.'],
];

/** 기준 소스가 linkPreview.ts 일 때만 문구를 새 값으로 바꾼다. */
export function withCardCopy1116(path: string, source: string): string {
  if (!path.endsWith('src/lib/marketing/linkPreview.ts')) return source;
  return CARD_COPY_1116.reduce((s, [from, to]) => s.split(from).join(to), source);
}
