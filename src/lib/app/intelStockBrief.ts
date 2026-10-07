/**
 * 앱 Intel 섹터 상세 «종목 구조 해석»(STRUCTURAL READ) — 종목 행의 값만으로 만드는 규칙 문장 (2026-10-07, 앱 강화 정확성 3차 · 순수 함수)
 *
 * 예전에는 intel/page.tsx 안의 함수였다(그대로 옮겼다). 달라진 것: ① 관찰형 문장 — «흡수되는 쪽으로 해석»·«확대될 수 있는 구간»·«레벨 반응 확인이 우선»·
 *   «다음 변동성 확장 여부를 확인하는 보조 신호» 같은 앞일·권유 서술을 «구조 설명»으로(대표 지시 9/29: 관찰·조건만) ② 한국어도 이 생성기를 쓴다 —
 *   서버 스냅샷의 analysis_kr(마감 시각 값 · «하방 지지 예상»·«돌파 시 감마스퀴즈 가능»)은 앱에 쓰지 않는다.
 * 시험: tests/intelSectorBrief.test.ts (한·일·영 모든 분기를 trustLayer 예측어 사전 + 엄격 사전으로 검사 — 0건 고정)
 */
import { formatLevelPrice } from '@/lib/optionLevelGate';
import { impliedMoveSessionNote } from '@/lib/impliedMove';

export type StockBriefLocale = 'ko' | 'en' | 'ja';

/** 종목 행(KeyStockPremiumData)의 부분집합 */
export interface StockBriefRow {
  sym: string;
  changePct?: number | null;
  closePrice?: number | null;
  gex?: number | null;
  pcr?: number | null;
  gammaRegime?: string | null;
  maxPain?: number | null;
  callWall?: number | null;
  putFloor?: number | null;
  rsi?: number | null;
  rvol?: number | null;
  netPremium?: number | null;
  squeezeScore?: number | null;
  ivSkew?: number | null;
  impliedMovePct?: number | null;
  impliedMoveBasis?: 'live' | 'eod' | null;
  impliedMoveSession?: string | null;
  impliedMoveAsOf?: number | null;
  whaleIndex?: number | null;
  darkPoolPct?: number | null;
  liquidityScore?: number | null;
}

function signedPct(value: number | null | undefined, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function formatMoneyCompact(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '-';
  const sign = value > 0 ? '+' : '-';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function getStockAnalyticalBrief(stock: StockBriefRow, appLocale: StockBriefLocale): string {
  const sym = stock.sym;
  const price = stock.closePrice != null ? `$${stock.closePrice.toFixed(2)}` : '—';
  const change = signedPct(stock.changePct, 2);
  const gex = stock.gex ?? 0;
  const pcr = stock.pcr ?? 0;
  const rsi = stock.rsi ?? 0;
  const rvol = stock.rvol ?? 0;
  const whale = stock.whaleIndex ?? 0;
  const darkPool = stock.darkPoolPct ?? null;
  const netPremium = stock.netPremium ?? 0;
  const squeeze = stock.squeezeScore ?? 0;
  const ivSkew = stock.ivSkew ?? 0;
  const impliedMove = stock.impliedMovePct ?? 0;
  const maxPain = stock.maxPain ?? 0;
  const callWall = stock.callWall ?? 0;
  const putFloor = stock.putFloor ?? 0;
  // ⚠️ GEX 를 못 잰 종목에 «NEUTRAL» 이라고 쓰면 «중립이라고 판정했다» 가 된다.
  //    벤더가 준 레짐이 없고 GEX 도 없으면 레짐을 말하지 않는다.
  const regime = stock.gammaRegime
    ? String(stock.gammaRegime).toUpperCase()
    : stock.gex == null ? 'UNKNOWN'
      : stock.gex > 0 ? 'LONG' : stock.gex < 0 ? 'SHORT' : 'NEUTRAL';

  const pcrText = pcr > 0 ? pcr.toFixed(2) : '-';
  const rsiText = rsi > 0 ? Math.round(rsi).toString() : '-';
  const rvolText = rvol > 0 ? `${rvol.toFixed(1)}x` : '-';
  const whaleText = whale > 0 ? Math.round(whale).toString() : '-';
  const darkPoolText = darkPool != null && darkPool > 0 ? `${Math.round(darkPool)}%` : '—';
  const netPremiumText = netPremium !== 0 ? formatMoneyCompact(netPremium) : '-';
  const squeezeText = squeeze > 0 ? `${Math.round(squeeze)}%` : '-';
  const ivText = ivSkew !== 0 ? signedPct(ivSkew, 1) : '-';
  // [10/4] 장외·주말 값은 «10/2 종가» 세션 꼬리표를 단다 — 지난 세션 값을 «지금»처럼 쓰지 않는다
  const impliedMoveNote = impliedMove > 0 ? impliedMoveSessionNote(stock, appLocale) : null;
  const impliedMoveText = impliedMove > 0 ? `±${impliedMove.toFixed(1)}%${impliedMoveNote ? ` (${impliedMoveNote})` : ''}` : '-';

  // ★ [3차] 관찰형 문장 — «흡수되는 쪽으로 해석»·«확대될 수 있는 구간»·«레벨 반응 확인이 우선» 같은 앞일·권유 서술을 «구조 설명»으로(예측어 사전과 같은 기준, tests/intelSectorBrief.test.ts)
  const gammaKR = regime === 'LONG'
    ? 'Long Gamma 구조(딜러 헤지가 변동을 누르는 쪽)입니다'
    : regime === 'SHORT'
      ? 'Short Gamma 구조(딜러 헤지가 변동을 키우는 쪽)입니다'
      : '감마가 중립권(롱·숏 경계 부근)입니다';
  const gammaEN = regime === 'LONG'
    ? 'Long Gamma structure (dealer hedging leans against moves)'
    : regime === 'SHORT'
      ? 'Short Gamma structure (dealer hedging adds to moves)'
      : 'Gamma is near neutral (close to the long/short boundary)';
  const gammaJA = regime === 'LONG'
    ? 'ロングガンマ構造(ディーラーのヘッジが値動きを抑える側)です'
    : regime === 'SHORT'
      ? 'ショートガンマ構造(ディーラーのヘッジが値動きを広げる側)です'
      : 'ガンマは中立圏(ロング・ショートの境界付近)です';

  // [2026-08-29] 다크풀 → 유동성. 값이 없으면 문장에서 아예 뺀다
  //   («다크풀 —가 함께 관찰되어» 처럼 깨진 문장이 나가면 안 된다)
  const liqScore: number | null = stock.liquidityScore ?? null;
  const liqText = liqScore == null ? null : String(Math.round(liqScore));
  const flowStrong = netPremium > 0 || whale >= 65 || (liqScore != null && liqScore >= 65);
  const liqKR = liqText ? `, 유동성 ${liqText}` : '';
  const liqEN = liqText ? `, Liquidity ${liqText}` : '';
  const liqJA = liqText ? `、流動性 ${liqText}` : '';
  const flowKR = flowStrong
    ? `순프리미엄 ${netPremiumText}, Whale ${whaleText}${liqKR}가 함께 관찰되어 수급 축은 비교적 선명합니다`
    : `순프리미엄 ${netPremiumText}, Whale ${whaleText}${liqKR} 기준으로 수급 확신 지표는 낮은 구간입니다`;
  const flowEN = flowStrong
    ? `Net premium ${netPremiumText}, Whale ${whaleText}${liqEN} show a clearer flow axis`
    : `Net premium ${netPremiumText}, Whale ${whaleText}${liqEN} show limited flow conviction`;
  const flowJA = flowStrong
    ? `ネットプレミアム${netPremiumText}、Whale ${whaleText}${liqJA}からフロー軸は比較的明確です`
    : `ネットプレミアム${netPremiumText}、Whale ${whaleText}${liqJA}ではフロー確度の指標は低い水準です`;

  const levelKR = callWall > 0 && putFloor > 0
    ? `핵심 레벨은 풋플로어 $${formatLevelPrice(putFloor)}와 콜월 $${formatLevelPrice(callWall)}이며, 현재가 ${price}는 맥스페인 ${maxPain > 0 ? `$${formatLevelPrice(maxPain)}` : '-'} 대비 ${maxPain > 0 ? signedPct(((stock.closePrice || 0) - maxPain) / maxPain * 100, 1) : '-'} 위치입니다`
    : `레벨 데이터가 제한적이어서 가격 ${price}와 PCR ${pcrText} 중심으로 구조를 확인합니다`;
  const levelEN = callWall > 0 && putFloor > 0
    ? `Key levels are Put Floor $${formatLevelPrice(putFloor)} and Call Wall $${formatLevelPrice(callWall)}; ${price} sits ${maxPain > 0 ? signedPct(((stock.closePrice || 0) - maxPain) / maxPain * 100, 1) : '-'} versus Max Pain ${maxPain > 0 ? `$${formatLevelPrice(maxPain)}` : '-'}`
    : `Level data is limited, so the structure is read mainly through ${price} and PCR ${pcrText}`;
  const levelJA = callWall > 0 && putFloor > 0
    ? `主要レベルはPut Floor $${formatLevelPrice(putFloor)}、Call Wall $${formatLevelPrice(callWall)}で、現在値${price}はMax Pain ${maxPain > 0 ? `$${formatLevelPrice(maxPain)}` : '-'}比${maxPain > 0 ? signedPct(((stock.closePrice || 0) - maxPain) / maxPain * 100, 1) : '-'}です`
    : `レベル情報が限定的なため、${price}とPCR ${pcrText}を中心に構造を確認します`;

  if (appLocale === 'ja') {
    return `${sym}は${change}、RSI ${rsiText}、RVOL ${rvolText}で推移しています。${gammaJA}。${flowJA}。${levelJA}。Squeeze ${squeezeText}、IV Skew ${ivText}、Implied Move ${impliedMoveText}は補助指標です。`;
  }

  if (appLocale === 'ko') {
    return `${sym}는 ${change}, RSI ${rsiText}, RVOL ${rvolText} 흐름입니다. ${gammaKR}. ${flowKR}. ${levelKR}. Squeeze ${squeezeText}, IV Skew ${ivText}, Implied Move ${impliedMoveText}는 보조 지표입니다.`;
  }

  return `${sym} is moving ${change} with RSI ${rsiText} and RVOL ${rvolText}. ${gammaEN}. ${flowEN}. ${levelEN}. Squeeze ${squeezeText}, IV Skew ${ivText}, and Implied Move ${impliedMoveText} are secondary indicators.`;
}
