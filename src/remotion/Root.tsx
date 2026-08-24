// ============================================================================
// Remotion Root ? ��� Composition ��� (V3 Hybrid)
// ============================================================================

import React from 'react';
import { Composition } from 'remotion';
import { PhoneAd, phoneAdDuration } from './kit/PhoneAd';
import { Race, raceDuration, RACE_FPS, type RaceProps } from './kit/Race';
import { Stat, statDuration, STAT_FPS, type StatProps } from './kit/Stat';
import { AppAd, AppAdTag, APPAD_DURATION, APPAD_DURATION_SOLO, APPAD_TAG_DURATION, APPAD_FPS } from './kit/AppAd';
import { Thumb, THUMB_AMD819 } from './kit/Thumb';
import { OutroCard, OUTRO_FRAMES, OUTRO_FPS } from './kit/Outro';
import { Trailer, TRAILER_FPS, TRAILER_FRAMES } from './kit/Trailer';
import { JPAvatar, JPBanner } from './kit/JPBrand';
import { Concept2, C2_DURATION, C2_FPS } from './kit/Concept2';
import { Concept, CONCEPT_DURATION, CONCEPT_FPS } from './kit/Concept';
import { PHONEAD_SIGNUM } from './kit/phonead-signum';
import { MarketPulseVideo, type MarketPulseProps } from './compositions/MarketPulseVideo';
import { NewsDigestVideo, type NewsDigestProps } from './compositions/NewsDigestVideo';
import { EventSpikeVideo, type EventSpikeProps } from './compositions/EventSpikeVideo';
import { MarketPulseV3, type MarketPulseV3Props } from './compositions/MarketPulseV3';
import { FacelessShortsV4, type FacelessShortsProps } from './compositions/FacelessShortsV4';
import { HiddenWallShort, type HiddenWallShortProps } from '../shorts/remotion/templates/HiddenWallShort';
import { createMockMarketPressureBriefV9AInput } from '../shorts/data/mockMarketPressureBriefV9A';
import { MarketPressureBrief } from '../shorts/remotion/templates/MarketPressureBrief';
import { MarketPressureKeyframesV10 } from '../shorts/remotion/templates/MarketPressureKeyframesV10';
import { MarketPressureBriefV10B } from '../shorts/remotion/templates/MarketPressureBriefV10B';
import { createMockMarketPressureBriefV10BInput } from '../shorts/data/mockMarketPressureBriefV10B';
import { MarketPressureBriefV10C } from '../shorts/remotion/templates/MarketPressureBriefV10C';
import { createMockMarketPressureBriefV10CInput } from '../shorts/data/mockMarketPressureBriefV10C';
import { MarketPressureBriefV10D } from '../shorts/remotion/templates/MarketPressureBriefV10D';
import { createMockMarketPressureBriefV10DInput } from '../shorts/data/mockMarketPressureBriefV10D';
import { MarketPressureBriefV11 } from '../shorts/remotion/templates/MarketPressureBriefV11';
import { createMockMarketPressureBriefV11Input } from '../shorts/data/mockMarketPressureBriefV11';
import { MarketPressureBriefV12A } from '../shorts/remotion/templates/MarketPressureBriefV12A';
import { createMockMarketPressureBriefV12AInput } from '../shorts/data/mockMarketPressureBriefV12A';
import { MarketPressureBriefV12B } from '../shorts/remotion/templates/MarketPressureBriefV12B';
import { createMockMarketPressureBriefV12BInput } from '../shorts/data/mockMarketPressureBriefV12B';
import { MarketPressureBriefV12C } from '../shorts/remotion/templates/MarketPressureBriefV12C';
import { createMockMarketPressureBriefV12CInput } from '../shorts/data/mockMarketPressureBriefV12C';
import { MarketPressureBriefV13 } from '../shorts/remotion/templates/MarketPressureBriefV13';
import { createMockMarketPressureBriefV13Input } from '../shorts/data/mockMarketPressureBriefV13';
import { MarketPressureBriefV14 } from '../shorts/remotion/templates/MarketPressureBriefV14';
import { createMockMarketPressureBriefV14Input } from '../shorts/data/mockMarketPressureBriefV14';
import { MarketPressureBriefV14_1 } from '../shorts/remotion/templates/MarketPressureBriefV14_1';
import { createMockMarketPressureBriefV14_1Input } from '../shorts/data/mockMarketPressureBriefV14_1';
import { MarketPressureBriefV15 } from '../shorts/remotion/templates/MarketPressureBriefV15';
import { createMockMarketPressureBriefV15Input } from '../shorts/data/mockMarketPressureBriefV15';
import { MarketPressureBriefV16 } from '../shorts/remotion/templates/MarketPressureBriefV16';
import { createMockMarketPressureBriefV16Input } from '../shorts/data/mockMarketPressureBriefV16';
import { MarketPressureBriefV16_1 } from '../shorts/remotion/templates/MarketPressureBriefV16_1';
import { createMockMarketPressureBriefV16_1Input } from '../shorts/data/mockMarketPressureBriefV16_1';
import { MarketPressureBriefV16_2 } from '../shorts/remotion/templates/MarketPressureBriefV16_2';
import { createMockMarketPressureBriefV16_2Input } from '../shorts/data/mockMarketPressureBriefV16_2';
import { MarketPressureBriefV17 } from '../shorts/remotion/templates/MarketPressureBriefV17';
import { createMockMarketPressureBriefV17Input } from '../shorts/data/mockMarketPressureBriefV17';
import { MarketPressureBriefV18 } from '../shorts/remotion/templates/MarketPressureBriefV18';
import { createMockMarketPressureBriefV18Input } from '../shorts/data/mockMarketPressureBriefV18';
import { MarketPressureBriefV19 } from '../shorts/remotion/templates/MarketPressureBriefV19';
import { createMockMarketPressureBriefV19Input } from '../shorts/data/mockMarketPressureBriefV19';
import { MarketPressureBriefV20 } from '../shorts/remotion/templates/MarketPressureBriefV20';
import { createMockMarketPressureBriefV20Input } from '../shorts/data/mockMarketPressureBriefV20';
import { MarketPressureBriefV21 } from '../shorts/remotion/templates/MarketPressureBriefV21';
import { createMockMarketPressureBriefV21Input } from '../shorts/data/mockMarketPressureBriefV21';
import { MarketPressureBriefV21_1 } from '../shorts/remotion/templates/MarketPressureBriefV21_1';
import { createMockMarketPressureBriefV21_1Input } from '../shorts/data/mockMarketPressureBriefV21_1';
import { MarketPressureBriefV21_2 } from '../shorts/remotion/templates/MarketPressureBriefV21_2';
import { createMockMarketPressureBriefV21_2Input } from '../shorts/data/mockMarketPressureBriefV21_2';
import { MarketPressureBriefV22 } from '../shorts/remotion/templates/MarketPressureBriefV22';
import { createMockMarketPressureBriefV22Input } from '../shorts/data/mockMarketPressureBriefV22';
import { MarketPressureBriefV23 } from '../shorts/remotion/templates/MarketPressureBriefV23';
import { createMockMarketPressureBriefV23Input } from '../shorts/data/mockMarketPressureBriefV23';
import { MarketPressureBriefV24 } from '../shorts/remotion/templates/MarketPressureBriefV24';
import { createMockMarketPressureBriefV24Input } from '../shorts/data/mockMarketPressureBriefV24';
import { MarketPressureBriefV25 } from '../shorts/remotion/templates/MarketPressureBriefV25';
import { createMockMarketPressureBriefV25Input } from '../shorts/data/mockMarketPressureBriefV25';
import { MarketPressureBriefV26 } from '../shorts/remotion/templates/MarketPressureBriefV26';
import { createMockMarketPressureBriefV26Input } from '../shorts/data/mockMarketPressureBriefV26';
import { MarketPressureBriefV27 } from '../shorts/remotion/templates/MarketPressureBriefV27';
import { createMockMarketPressureBriefV27Input } from '../shorts/data/mockMarketPressureBriefV27';
import { MarketPressureBriefV28 } from '../shorts/remotion/templates/MarketPressureBriefV28';
import { createMockMarketPressureBriefV28Input } from '../shorts/data/mockMarketPressureBriefV28';
import { MarketPressureBriefV29 } from '../shorts/remotion/templates/MarketPressureBriefV29';
import { createMockMarketPressureBriefV29Input } from '../shorts/data/mockMarketPressureBriefV29';
import { MarketPressureBriefV30 } from '../shorts/remotion/templates/MarketPressureBriefV30';
import { createMockMarketPressureBriefV30Input } from '../shorts/data/mockMarketPressureBriefV30';
import { MarketPressureBriefV31 } from '../shorts/remotion/templates/MarketPressureBriefV31';
import { createMockMarketPressureBriefV31Input } from '../shorts/data/mockMarketPressureBriefV31';
import { MarketPressureBriefV32 } from '../shorts/remotion/templates/MarketPressureBriefV32';
import { createMockMarketPressureBriefV32Input } from '../shorts/data/mockMarketPressureBriefV32';
import { MarketPressureBriefV33 } from '../shorts/remotion/templates/MarketPressureBriefV33';
import { createMockMarketPressureBriefV33Input } from '../shorts/data/mockMarketPressureBriefV33';
import { MarketPressureBriefV34 } from '../shorts/remotion/templates/MarketPressureBriefV34';
import { createMockMarketPressureBriefV34Input } from '../shorts/data/mockMarketPressureBriefV34';
import { MarketPressureBriefV35 } from '../shorts/remotion/templates/MarketPressureBriefV35';
import { createMockMarketPressureBriefV35Input } from '../shorts/data/mockMarketPressureBriefV35';
import { MarketPressureBriefV36 } from '../shorts/remotion/templates/MarketPressureBriefV36';
import { createMockMarketPressureBriefV36Input } from '../shorts/data/mockMarketPressureBriefV36';
import { MarketPressureBriefV37 } from '../shorts/remotion/templates/MarketPressureBriefV37';
import { createMockMarketPressureBriefV37Input } from '../shorts/data/mockMarketPressureBriefV37';
import { BriefingV1, BRIEFING_DURATION } from './compositions/BriefingV1';
import { BriefingV2, BRIEFING2_DURATION } from './compositions/BriefingV2';
import { SAMPLE_BRIEFING_2 } from './data/sampleBriefing2';
import { BriefingV3, BRIEFING3_DURATION } from './compositions/BriefingV3';
import { SAMPLE_BRIEFING_3 } from './data/sampleBriefing3';
import { BriefingV4, BRIEFING4_DURATION } from './compositions/BriefingV4';
import { SAMPLE_BRIEFING_4 } from './data/sampleBriefing4';
import { BriefingV5, BRIEFING5_DURATION } from './compositions/BriefingV5';
import { SAMPLE_BRIEFING_5 } from './data/sampleBriefing5';
import { BriefingV6, BRIEFING6_DURATION } from './compositions/BriefingV6';
import { SAMPLE_BRIEFING_6 } from './data/sampleBriefing6';
import { BriefingV7, BRIEFING7_DURATION } from './compositions/BriefingV7';
import { SAMPLE_BRIEFING_7 } from './data/sampleBriefing7';
import { Briefing, durationOf } from './kit/Briefing';
import {
  SCRIPT_T1, SCRIPT_FLIP, SCRIPT_CLOSE, SCRIPT_T2, SCRIPT_T4, SCRIPT_T2B,
  SCRIPT_CLOSE811, SCRIPT_COPPER, SCRIPT_RECORDS, SCRIPT_OILSYM, SCRIPT_DEFENSE, SCRIPT_CPI812, SCRIPT_META812, SCRIPT_GOOGL812, SCRIPT_CPIOUT, SCRIPT_MU812, SCRIPT_CLOSE812,
  SCRIPT_CLOSE814,
  SCRIPT_RETAIL817,
  SCRIPT_JOBS817,
  SCRIPT_FEDGAP817,
  SCRIPT_MORNING818,
  SCRIPT_CLOSE817,
  SCRIPT_LONGEND818,
  SCRIPT_UNWIND818,
  SCRIPT_TRIPLE818,
  SCRIPT_TRIPLEB,
  SCRIPT_AMD819,
  SCRIPT_DISP820,
  SCRIPT_KOREA820,
  SCRIPT_MEMCORR,
  SCRIPT_GOLD821,
  SCRIPT_OPEX821,
  SCRIPT_AICON,
  SCRIPT_JPOPEX,
  SCRIPT_JPGAMMA,
  SCRIPT_JPEARN,
  SCRIPT_EARN822,
  SCRIPT_JPCONS,
  SCRIPT_JPYEN,
  SCRIPT_JP10D,
  SCRIPT_JPPOST,
  SCRIPT_JPLF,
  SCRIPT_USRATE,
  SCRIPT_TARIFF,
  SCRIPT_JPTARIFF,
  SCRIPT_USNVDA,
  SCRIPT_JPNVDA,
  SCRIPT_JPWEEKA,
  SCRIPT_JPWEEKB,
  SCRIPT_JPRATE,
  SCRIPT_JPFX,
  SCRIPT_LFEARN,
  SCRIPT_BONDS821,
} from './kit/scripts';
// �� ĳ�־� ���ø� (2026-08-13) ? Briefing �� �ڸ���. props ����� ���� cutFor �� �����Ѵ�.
import { ThumbLF, THUMBLF_JPLF } from './kit/ThumbLF';
import { Casual, casualDurationOf, type CasualProps } from './kit/Casual';
import { SCRIPT_DUEL813, SCRIPT_DUELB, SCRIPT_MAXPAIN, SCRIPT_PRE813, SCRIPT_PRE814, SCRIPT_REGIME813 } from './kit/scripts-casual';
// ★ 교육형 재고 — 날짜 무관. 하루 4번째 슬롯을 소재 고갈 없이 채운다 (kit/scripts-edu)
import {
  SCRIPT_EDUDARK, SCRIPT_EDUSQZ, SCRIPT_EDUGAMMA,
  SCRIPT_EDUPCR, SCRIPT_EDUVWAP, SCRIPT_EDUFLOW,
} from './kit/scripts-edu';
import { cutFor, leanCut, type Platform } from './kit/variants';
import { AdPromo, adDurationOf } from './kit/AdPromo';
import { AD_SIGNUM } from './kit/ads';
import { EndCard } from './kit/EndCard';
import { ENDCARD_FRAMES, type AppKey } from './kit/endcards';
import { SAMPLE_BRIEFING } from './data/sampleBriefing';



// ── Race : 두 대상 + 시간 누적 (터진 영상 8편 픽셀 측정으로 뽑은 뼈대) ──────
//   숫자는 FMP 분할조정 종가 실측 (.agent/_race.json). 손대지 말 것.
const RACE_NVDA_INTC: RaceProps = {
  title: ['$10,000 in NVIDIA vs Intel', '10 years ago'],
  a: { sym: 'NVDA', name: 'NVIDIA', color: '#76B900' },
  b: { sym: 'INTC', name: 'INTEL', color: '#3B8EEA' },
  seed: '$10,000',
  rows: [{"y": 2016, "a": 10000, "b": 10000}, {"y": 2017, "a": 27712, "b": 9772}, {"y": 2018, "a": 45882, "b": 13494}, {"y": 2019, "a": 27386, "b": 13210}, {"y": 2020, "a": 87386, "b": 14196}, {"y": 2021, "a": 146340, "b": 15063}, {"y": 2022, "a": 98627, "b": 8894}, {"y": 2023, "a": 322614, "b": 9791}, {"y": 2024, "a": 780196, "b": 6141}, {"y": 2025, "a": 1138431, "b": 6785}, {"y": 2026, "a": 1403399, "b": 25096}],
  stepSec: 1.15,
  holdSec: 3.4,
  music: 'shorts/audio/race-bed.mp3',
};


// ⛔ 미국 레이스 · AI 칩 1년 (2026-08-24 실측 · .agent/_chip_race.json)
//   왜 이 포맷: 미국 33편에서 레이스 4편 중앙 345.5 vs 브리핑 29편 중앙 41 = 8.4배.
//   왜 이 소재: 제목 수요 앵커 5천~2만 구간이 중앙 266.5 로 최고 (2만+ 는 14 로 최하).
//               chip stocks = 8,724 로 그 구간 한가운데.
//   왜 지금: 엔비디아 실적이 8/26. 그 이틀 전에 «1년 성적표» 를 놓는다.
//   ⛔ 예측하지 않는다. 2025-08-22 ~ 2026-08-21 확정 종가만 쓴다.
const RACE_CHIP1Y: RaceProps = {
  title: ['$10,000 in AMD vs NVIDIA', 'one year ago'],
  a: { sym: 'AMD', name: 'AMD', color: '#ED1C24' },
  b: { sym: 'NVDA', name: 'NVIDIA', color: '#76B900' },
  seed: '$10,000',
  rows: [{"y": "2025-08", "a": 9694, "b": 9786}, {"y": "2025-09", "a": 9644, "b": 10483}, {"y": "2025-10", "a": 15267, "b": 11376}, {"y": "2025-11", "a": 12967, "b": 9944}, {"y": "2025-12", "a": 12766, "b": 10478}, {"y": "2026-01", "a": 14111, "b": 10738}, {"y": "2026-02", "a": 11934, "b": 9955}, {"y": "2026-03", "a": 12126, "b": 9798}, {"y": "2026-04", "a": 21131, "b": 11212}, {"y": "2026-05", "a": 30764, "b": 11862}, {"y": "2026-06", "a": 34627, "b": 11242}, {"y": "2026-07", "a": 28383, "b": 11279}, {"y": "2026-08", "a": 28210, "b": 12064}],
  stepSec: 0.95,
  holdSec: 3.6,
  footnote: 'Broadcom over the same year: $12,532',
  endCard: { line1: 'Nvidia reports Wednesday.', line2: 'It is last of the three.', sec: 2.8 },
  music: 'shorts/audio/race-bed.mp3',
};

const RACE_AMD_INTC: RaceProps = {
  title: ['$10,000 in AMD vs Intel', '10 years ago'],
  a: { sym: 'AMD', name: 'AMD', color: '#ED1C24' },
  b: { sym: 'INTC', name: 'INTEL', color: '#3B8EEA' },
  seed: '$10,000',
  rows: [{"y": 2016, "a": 10000, "b": 10000}, {"y": 2017, "a": 17568, "b": 9772}, {"y": 2018, "a": 34014, "b": 13494}, {"y": 2019, "a": 42500, "b": 13210}, {"y": 2020, "a": 122730, "b": 14196}, {"y": 2021, "a": 149622, "b": 15063}, {"y": 2022, "a": 114689, "b": 8894}, {"y": 2023, "a": 142865, "b": 9791}, {"y": 2024, "a": 200757, "b": 6141}, {"y": 2025, "a": 219770, "b": 6785}, {"y": 2026, "a": 639527, "b": 25096}],
  stepSec: 1.15,
  holdSec: 3.4,
  music: 'shorts/audio/race-bed.mp3',
};

const RACE_NVDA_AAPL: RaceProps = {
  title: ['$10,000 in NVIDIA vs Apple', '10 years ago'],
  a: { sym: 'NVDA', name: 'NVIDIA', color: '#76B900' },
  b: { sym: 'AAPL', name: 'APPLE', color: '#E8E8ED' },
  seed: '$10,000',
  rows: [{"y": 2016, "a": 10000, "b": 10000}, {"y": 2017, "a": 27712, "b": 15454}, {"y": 2018, "a": 45882, "b": 21451}, {"y": 2019, "a": 27386, "b": 19672}, {"y": 2020, "a": 87386, "b": 48639}, {"y": 2021, "a": 146340, "b": 57230}, {"y": 2022, "a": 98627, "b": 59261}, {"y": 2023, "a": 322614, "b": 70814}, {"y": 2024, "a": 780196, "b": 86317}, {"y": 2025, "a": 1138431, "b": 87501}, {"y": 2026, "a": 1403399, "b": 116604}],
  stepSec: 1.15,
  holdSec: 3.4,
  music: 'shorts/audio/race-bed.mp3',
};


// ── Race 일본판 (2026-08-23) ────────────────────────────────────────────────
//   ⛔ 미국판을 번역만 한 게 아니다. 일본 실측 3가지를 반영했다:
//     ① 【】 대괄호 — 일본 폭발작 관습. 미국엔 없다
//     ② 제목이 «묻는다» — 가장 가까운 레퍼런스 株データ検証 Fund Lens(구독 776 → 29만회)의
//        폭발작이 「【積立】FANG+に毎月約1万円積み立てたら10年後いくら？」 였다
//     ③ 금액은 «万·億» 단위 — 일본은 ¥140,339,900 을 그렇게 안 읽는다
const RACE_JP_NVDA_INTC: RaceProps = {
  title: ['10年前に100万円', 'エヌビディアとインテル'],
  a: { sym: 'NVDA', name: 'エヌビディア', color: '#76B900' },
  b: { sym: 'INTC', name: 'インテル', color: '#3B8EEA' },
  seed: '100万円',
  currency: 'jpy',
  jp: true,
  footnote: '2016年8月に100万円を投資した場合',
  rows: [{"y": 2016, "a": 1000000, "b": 1000000}, {"y": 2017, "a": 2771200, "b": 977200}, {"y": 2018, "a": 4588200, "b": 1349400}, {"y": 2019, "a": 2738600, "b": 1321000}, {"y": 2020, "a": 8738600, "b": 1419600}, {"y": 2021, "a": 14634000, "b": 1506300}, {"y": 2022, "a": 9862700, "b": 889400}, {"y": 2023, "a": 32261400, "b": 979100}, {"y": 2024, "a": 78019600, "b": 614100}, {"y": 2025, "a": 113843100, "b": 678500}, {"y": 2026, "a": 140339900, "b": 2509600}],
  stepSec: 1.15,
  holdSec: 3.4,
  music: 'shorts/audio/race-bed.mp3',
};


// ── Stat : 폭발률 7.1% 군집 복제 (2026-08-23) ─────────────────────────────
//   R2 「THE RICHEST MEN IN THE WORLD ARE」 485만회의 구조 그대로:
//     상단 고정 제목(핵심어만 노랑) + 움직이는 영상 + 하단 통계 라벨 + 결론 + 행동유도
//   ⛔ 클립은 우리 라이브러리에서 «중앙활동 150+» 인 것만 골랐다 (실측 상위권).
//   ⛔ 수치는 .agent/_race.json 실측 (FMP 분할조정 종가, 2016-08 → 2026-08).
const STAT_CHIPS: StatProps = {
  title: { pre: 'WHO ACTUALLY GOT ', hot: 'RICH', post: ' IN CHIPS' },
  beats: [
    { clip: 'steel-balls',     value: '+13,934%', label: 'NVIDIA', sec: 4.2 },
    { clip: 'ani-wafer-lift',  value: '+6,295%',  label: 'AMD',    sec: 4.2 },
    { clip: 'ani-chip-pull',   value: '+151%',    label: 'INTEL',  sec: 4.2 },
  ],
  verdict: 'Same industry. Same decade.',
  cta: 'WHICH ONE DID YOU HOLD?',
  source: '$10,000 in Aug 2016 · split-adjusted closes',
  music: 'shorts/audio/race-bed.mp3',
};


// ── Stat 일본판 (2026-08-23) ────────────────────────────────────────────────
//   ⛔ 미국판 첫 편의 결함을 고친 것이다. 거기서는 클립을 «움직임 점수» 로만 골랐고,
//     그 결과 「+151% 인텔」 옆에 «급등하는 초록 차트» 가 붙었다 — 그림이 숫자를 반박했다.
//     레퍼런스는 반대다: 호날두 옆에 「7% ATHLETES」, 지친 직장인 옆에 「0% EMPLOYEES」.
//     ⇒ 여기서는 클립을 «그 숫자를 보여주는 그림인가» 로 골랐다:
//        rise-stairs-light(168) 계단이 올라감 → 1위
//        ani-floor-fills(135)   바닥이 채워짐 → 2위
//        ani-vault-drain(157)   금고가 비어감 → 꼴찌
//     서열이 그림으로 읽힌다. 움직임은 셋 다 135~168 로 레퍼런스대(157~205) 근처다.
const STAT_JP_CHIPS: StatProps = {
  title: { pre: '同じ100万円、10年で', hot: '一番増えた', post: 'のは' },
  beats: [
    // ⛔ 세로 클립(움직임 150~193)을 가로 띠에 넣었더니 «뜻이 안 읽혔다».
    //   rise-stairs-light 는 「계단이 올라간다」인데 크롭하면 콘크리트 덩어리다.
    //   레퍼런스 클립은 원래 가로라 그대로 들어간다 — 우리 라이브러리는 세로용으로 만들어졌다.
    //   우리 가로 클립 40개는 전부 ax- 캐릭터이고 최고 움직임이 112 다 (150+ 는 0개).
    //   ⇒ «뜻» 을 택했다. 움직임 손해는 측정으로 확인한다 (레퍼런스 157~205 대비 얼마나 빠지는지).
    { clip: 'ax-stack-blocks',  value: '+13,934%', label: 'エヌビディア', sec: 4.2, from: 5.4 },
    { clip: 'ax-two-piles',     value: '+6,295%',  label: 'AMD',      sec: 4.2, from: 3.6 },
    { clip: 'ax-podium-empty',  value: '+151%',    label: 'インテル',   sec: 4.2 },
  ],
  verdict: '同じ半導体、同じ10年。',
  cta: 'あなたはどれを持っていた？',
  source: '2016年8月に100万円 · 株式分割調整済み終値',
  jp: true,
  music: 'shorts/audio/race-bed.mp3',
};


// ── Race 일본판 2편 (2026-08-23) ───────────────────────────────────────────
//   ⛔ 포맷을 바꾸지 않는다. 지금 일본에서 가장 빠른 것이 Race 다 (7시간 489회 · 11회/분).
//     대표 지시: "완전 포맷을 틀지말고 강화하고 원하는주제 소재를 던져주자"
//   ⛔ 소재는 «살아난 두 주제» 를 합쳤다:
//     S&P500 (옛 영상 617회 · 우리 실측 수요 20,926 — 일본 사전 최상위)
//     エヌビディア (Race 1편 538회 · 수요 14,658)
//     둘 다 일본 NISA 투자자가 «실제로 마주하는 선택» 이다. 만들어낸 프레임이 아니다.
const RACE_JP_SPY_NVDA: RaceProps = {
  title: ['10年前に100万円', 'S&P500とエヌビディア'],
  // ⛔ 끝 카드는 «광고» 가 아니라 «해석» 이다 (2026-08-23).
  //   본편은 비교만 보여준다 — 그것만으로는 인사이트가 없다.
  //   일본에서 가장 잘 나온 옛 영상은 「S&P500が静かな理由、中では二つに割れている」 —
  //   «해석» 이 제목에 있었다. 우리 Race 는 숫자만 있었다.
  //   실측: 엔비디아는 10년 중 2번 하락, 최악 -40.3%(2019). S&P500 은 1번, -12.5%.
  //   ⇒ 「40배의 길에 -40%의 해가 2번」 — 이게 사람이 가져가는 것이다. 앱은 그 뒤에 붙인다.
  endCard: {
    line1: '40倍の道には、-40%の年が2回ありました',
    line2: '米国株の実測 · signumhq.com/app',
    sec: 2.8,
  },
  a: { sym: 'SPY', name: 'S&P500', color: '#4FA3FF' },
  b: { sym: 'NVDA', name: 'エヌビディア', color: '#76B900' },
  seed: '100万円',
  currency: 'jpy',
  jp: true,
  footnote: '2016年8月に100万円を投資した場合',
  rows: [{"y": 2016, "a": 1000000, "b": 1000000}, {"y": 2017, "a": 1138513, "b": 2771242}, {"y": 2018, "a": 1335495, "b": 4588235}, {"y": 2019, "a": 1345340, "b": 2738562}, {"y": 2020, "a": 1606910, "b": 8738562}, {"y": 2021, "a": 2077284, "b": 14633987}, {"y": 2022, "a": 1817923, "b": 9862745}, {"y": 2023, "a": 2071718, "b": 32261438}, {"y": 2024, "a": 2593063, "b": 78019608}, {"y": 2025, "a": 2967384, "b": 113843137}, {"y": 2026, "a": 3522495, "b": 140339869}],
  stepSec: 1.15,
  holdSec: 3.4,
  music: 'shorts/audio/race-bed.mp3',
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ?? �� ȫ�� ����ī�� 3�� �� (105f �⺻ / 210f Ȯ��) ? ���� ��6 ??
          105f �� �긮�� ������ ���̴� ��, 210f �� X���� ����Ρ����� ��� ����. */}
      {(['signum', 'uc', 'wim'] as AppKey[]).flatMap((app) => ([
        <Composition
          key={`ec-${app}`}
          id={`EndCard-${app}`}
          component={EndCard as React.ComponentType<any>}
          durationInFrames={ENDCARD_FRAMES.short}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{ app }}
        />,
        <Composition
          key={`ec-${app}-long`}
          id={`EndCard-${app}-7s`}
          component={EndCard as React.ComponentType<any>}
          durationInFrames={ENDCARD_FRAMES.long}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{ app, frames: ENDCARD_FRAMES.long }}
        />,
      ]))}

      {/* ?? �ű� ���� ? ��SIGNUM �긮�Ρ�. ���� .agent/VIDEO_ENGINE_SPEC.md ??
          ���� V10?V37 42���� ��� ����(��ǥ ����). �̰��� ���ϸ� 3���� ��ü��. */}
      <Composition
        id="BriefingV1"
        component={BriefingV1 as React.ComponentType<any>}
        durationInFrames={BRIEFING_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING}
      />

      {/* V2 ? �̾߱� ���� + ��� �ڸ� + ��� ��� ����. V1�� ���ġ��������½�ӡ� �缳�� */}
      <Composition
        id="BriefingV2"
        component={BriefingV2 as React.ComponentType<any>}
        durationInFrames={BRIEFING2_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING_2}
      />

      {/* V3 ? Ǯ����� �ǻ� ��� + �Ŵ� �ڹ� ������ + ����ġ ��Ʈ (���۷��� ����)
          + �� �켱(Ÿ��Ʋ ī�� ����) ? ���� ���ټ� ���� �ݿ� */}
      <Composition
        id="BriefingV3"
        component={BriefingV3 as React.ComponentType<any>}
        durationInFrames={BRIEFING3_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING_3}
      />

      {/* V4 ? �ϼ���. Ŀ������Ƽ ���� + ���ټ� ������ + ��� �ڸ� + �ǻ� ��� */}
      <Composition
        id="BriefingV4"
        component={BriefingV4 as React.ComponentType<any>}
        durationInFrames={BRIEFING4_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING_4}
      />

      {/* V5 ? ���� �� ���� �� �ı� �� �츮 ������. ��¥ ���� + �߾� ä�� + ��ȭ�� �߸� �ذ� */}
      <Composition
        id="BriefingV5"
        component={BriefingV5 as React.ComponentType<any>}
        durationInFrames={BRIEFING5_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING_5}
      />

      {/* V6 ? ������ɲ� ����: ������ʡ���¥���ڸ�3�ʡ��ٽɾ���������׸�����CTA */}
      <Composition
        id="BriefingV6"
        component={BriefingV6 as React.ComponentType<any>}
        durationInFrames={BRIEFING6_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING_6}
      />

      {/* V7 ? V5 ȭ�� + ���� Ŀ������Ƽ ���� �뺻 (�� ���� ������ �ʴ� ������ �����) */}
      <Composition
        id="BriefingV7"
        component={BriefingV7 as React.ComponentType<any>}
        durationInFrames={BRIEFING7_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING_7}
      />

      {/* �� ���� ���ø� ? �뺻(kit/scripts)�� �ٲٸ� �ٸ� ������ �ȴ� */}
      <Composition
        id="Briefing"
        component={Briefing as React.ComponentType<any>}
        durationInFrames={durationOf(SCRIPT_T1)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SCRIPT_T1}
      />

      {/* �� 42���� ? ���� ��� + �ݾƿ� + �������� �ο� (2026-08-06 ���� �뺻) */}
      <Composition
        id="BriefingFlip"
        component={Briefing as React.ComponentType<any>}
        durationInFrames={durationOf(SCRIPT_FLIP)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SCRIPT_FLIP}
      />

      {/* �� T4 �帶�� ���� �긮�� ? ����+�帧 ���ϳ��� ���丮�� (8/6 ���� ����) */}
      <Composition
        id="BriefingClose"
        component={Briefing as React.ComponentType<any>}
        durationInFrames={durationOf(SCRIPT_CLOSE)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SCRIPT_CLOSE}
      />
      {/* �� �긮�� ? �뺻 �� �÷��� 3�� (kit/variants)
          �ϳ��� �뺻���ϳ��� �������� �߶� ����. YT �� ��û�ð�, TT �� ������ ����.
          T2 = ������� ��� �� T4 = �帶�� Ŭ��¡ */}
            {/* ★ 롱폼 — 16:9. 조사한 롱폼 레퍼런스가 전부 가로다 (.agent/LONGFORM_RESEARCH.md).
          쇼츠 루프와 «별도»로 등록한다 — 캔버스도 안전영역도 다르다. */}
      <Composition
        id="LongformLFEARN"
        component={Briefing as React.ComponentType<any>}
        durationInFrames={durationOf(SCRIPT_LFEARN)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={SCRIPT_LFEARN}
      />

      {/* 롱폼 썸네일 — 16:9. 쇼츠와 달리 커스텀 썸네일이 «실제로 적용»된다 */}
      <Composition
        id="ThumbLFJPLF"
        component={ThumbLF as React.ComponentType<any>}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={THUMBLF_JPLF as any}
      />

      <Composition
        id="LongformJPLF"
        component={Briefing as React.ComponentType<any>}
        durationInFrames={durationOf(SCRIPT_JPLF)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={SCRIPT_JPLF}
      />

{([['T2', SCRIPT_T2], ['T4', SCRIPT_T4], ['T2B', SCRIPT_T2B],
         ['CLOSE811', SCRIPT_CLOSE811], ['COPPER', SCRIPT_COPPER],
         // ����� ? ���� ���࿡�� ���� �� (�ǽð� ��� �ƴ�, ���� �÷��� �ȴ�)
         ['RECORDS', SCRIPT_RECORDS], ['OILSYM', SCRIPT_OILSYM], ['DEFENSE', SCRIPT_DEFENSE],
         ['CPI812', SCRIPT_CPI812], ['META812', SCRIPT_META812], ['GOOGL812', SCRIPT_GOOGL812], ['CPIOUT', SCRIPT_CPIOUT], ['MU812', SCRIPT_MU812], ['CLOSE812', SCRIPT_CLOSE812],
         ['CLOSE814', SCRIPT_CLOSE814], ['RETAIL817', SCRIPT_RETAIL817], ['JOBS817', SCRIPT_JOBS817], ['FEDGAP817', SCRIPT_FEDGAP817], ['MORNING818', SCRIPT_MORNING818], ['CLOSE817', SCRIPT_CLOSE817], ['LONGEND818', SCRIPT_LONGEND818], ['UNWIND818', SCRIPT_UNWIND818], ['TRIPLE818', SCRIPT_TRIPLE818], ['TRIPLEB', SCRIPT_TRIPLEB], ['AMD819', SCRIPT_AMD819], ['DISP820', SCRIPT_DISP820], ['KOREA820', SCRIPT_KOREA820], ['MEMCORR', SCRIPT_MEMCORR], ['GOLD821', SCRIPT_GOLD821], ['OPEX821', SCRIPT_OPEX821], ['BONDS821', SCRIPT_BONDS821], ['JPOPEX', SCRIPT_JPOPEX], ['JPGAMMA', SCRIPT_JPGAMMA], ['JPEARN', SCRIPT_JPEARN], ['EARN822', SCRIPT_EARN822], ['JPCONS', SCRIPT_JPCONS], ['JPYEN', SCRIPT_JPYEN], ['JP10D', SCRIPT_JP10D], ['JPPOST', SCRIPT_JPPOST], ['USRATE', SCRIPT_USRATE], ['USNVDA', SCRIPT_USNVDA], ['JPNVDA', SCRIPT_JPNVDA], ['JPWEEKA', SCRIPT_JPWEEKA], ['JPWEEKB', SCRIPT_JPWEEKB], ['JPRATE', SCRIPT_JPRATE], ['JPFX', SCRIPT_JPFX], ['LFEARN', SCRIPT_LFEARN], ['AICON', SCRIPT_AICON], ['TARIFF', SCRIPT_TARIFF], ['JPTARIFF', SCRIPT_JPTARIFF]] as const).flatMap(([tag, src]) =>
        (['yt', 'tt', 'reels'] as Platform[]).map((pf) => {
          const cut = cutFor(src, pf);
          const id = pf === 'yt' ? `Briefing${tag}` : `Briefing${tag}-${pf}`;
          return (
            <Composition
              key={id}
              id={id}
              component={Briefing as React.ComponentType<any>}
              durationInFrames={durationOf(cut)}
              fps={30}
              width={1080}
              height={1920}
              defaultProps={cut}
            />
          );
        }))}

      {/* �ڡ� ĳ�־� ���ø� ? �뺻 �� �÷��� 3��.
          CASUAL_CLOSE812 �� SCRIPT_CLOSE812 �� �찰�� ���롤���� �������� A/B �������̴�.
          (���⼭ �����ϴ� ����: scripts-casual.ts �� scripts.ts �� import �ϸ� ��ȯ) */}
      {([
        // �� �� A/B ? ���������� ����, �Ÿ� �ٸ��� (scripts-casual �ר�-B ����)
        ['DUEL813', SCRIPT_DUEL813],   // A�� = ���� �� ���� (������)
        ['DUELB', SCRIPT_DUELB],       // B�� = ���� 0 �� 2��� �� ������ġ �� ���� ���
        ['PRE813', SCRIPT_PRE813],     // ���� �� �긮�� ? ��� �н� ���� ����
        ['MAXPAIN', SCRIPT_MAXPAIN],
        ['CLOSE812', { ...SCRIPT_CLOSE812, track: 'macro', tape: undefined, field: undefined } as CasualProps],
      ] as const).flatMap(([tag, src]) =>
        (['yt', 'tt', 'reels'] as Platform[]).map((pf) => {
          const cut = cutFor(src as any, pf) as CasualProps;
          const id = pf === 'yt' ? `Casual${tag}` : `Casual${tag}-${pf}`;
          return (
            <Composition
              key={id}
              id={id}
              component={Casual as React.ComponentType<any>}
              durationInFrames={casualDurationOf(cut)}
              fps={30}
              width={1080}
              height={1920}
              defaultProps={cut as any}
            />
          );
        }))}

      {/* �ڡ� LEAN �� ? �������� ��ɡ� (2026-08-13)
          ����: ����� 108���� 34�� ������ ��� 13�� �ô� = ������ 38%.
          Ȯ�� ������ 70%. ����(��û)�� �� �ø��� �и�(����)�� ���δ� �� 18�ʸ� 72%.
          ���� �뺻������ �������� ����� ��Ʈ���� ����� CTA �� �� �����. �߰� ��� 0. */}
      {([
        ['PRE813', SCRIPT_PRE813],
        ['REGIME813', SCRIPT_REGIME813],
        ['PRE814', SCRIPT_PRE814],         // �� 5�� ��Ģ 1ȣ
        // �� �� A/B �� ��lean ���̿����� ������ ? 33�� ���� A��B �� �� 16%�� �ٴ��� ��
        //   ���̰� �� ���� ������ �ִ�(�ٴ� ȿ��). 15�ʸ� �� �� ������ �޾� ���̰� �巯����.
        ['DUEL813', SCRIPT_DUEL813],
        ['DUELB', SCRIPT_DUELB],
        ['MAXPAIN', SCRIPT_MAXPAIN],
        // 교육형 재고 6편 — 전부 lean(15~20초) + 루프 이음매
        ['EDUDARK', SCRIPT_EDUDARK], ['EDUSQZ', SCRIPT_EDUSQZ], ['EDUGAMMA', SCRIPT_EDUGAMMA],
        ['EDUPCR', SCRIPT_EDUPCR], ['EDUVWAP', SCRIPT_EDUVWAP], ['EDUFLOW', SCRIPT_EDUFLOW],
      ] as const).map(([tag, src]) => {
        const cut = { ...(leanCut(src as any, 19) as any), lean: true } as CasualProps;
        return (
          <Composition
            key={`Lean${tag}`}
            id={`Lean${tag}`}
            component={Casual as React.ComponentType<any>}
            durationInFrames={casualDurationOf(cut)}
            fps={30}
            width={1080}
            height={1920}
            defaultProps={cut as any}
          />
        );
      })}

      {/* �� �� ���� ? �õ��� �ó׸�ƽ + �Ǿ� UI + �Ƿΰ� (kit/ads) */}
      {/* ★ 밝은 앱 광고 — 공중 폰 + 살아 움직이는 차트 + FREE (2026-08-19 신설) */}
      <Composition
        id="PhoneAdSignum"
        component={PhoneAd as React.ComponentType<any>}
        durationInFrames={phoneAdDuration(PHONEAD_SIGNUM)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={PHONEAD_SIGNUM as any}
      />

      <Composition
        id="ThumbAMD819"
        component={Thumb as React.ComponentType<any>}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={THUMB_AMD819}
      />
      <Composition
        id="AppAd"
        component={AppAd}
        durationInFrames={APPAD_DURATION}
        fps={APPAD_FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="AppAdSolo"
        component={AppAd}
        durationInFrames={APPAD_DURATION_SOLO}
        fps={APPAD_FPS}
        width={1080}
        height={1920}
      defaultProps={{ withUC: false }}
      />
      <Composition
        id="AppAdTag"
        component={AppAdTag}
        durationInFrames={APPAD_TAG_DURATION}
        fps={APPAD_FPS}
        width={1080}
        height={1920}
      
      />
      <Composition
        id="Concept1MaxPain"
        component={Concept as React.ComponentType<any>}
        durationInFrames={CONCEPT_DURATION}
        fps={CONCEPT_FPS}
        width={1080}
        height={1920}
      
      />
      <Composition
        id="AdSignum"
        component={AdPromo as React.ComponentType<any>}
        durationInFrames={adDurationOf(AD_SIGNUM)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={AD_SIGNUM}
      />

      {/* ���� Shorts Engine V37 Real-Time SSoT Premium Rebuild (24.633s, 739 frames) ���� */}
      <Composition
        id="MarketPressureBriefV37-NVDA"
        component={MarketPressureBriefV37 as React.ComponentType<any>}
        durationInFrames={739}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV37Input()}
      />

      {/* ���� Shorts Engine V36 SSoT Rebuild (17.868s, 536 frames) ���� */}
      <Composition
        id="MarketPressureBriefV36-SPY"
        component={MarketPressureBriefV36 as React.ComponentType<any>}
        durationInFrames={536}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV36Input()}
      />
      {/* ���� Shorts Engine V35 ���ϸ� ��� Ư�� & 3-Shorts ��ȭ ü�� (24.0s) ���� */}
      <Composition
        id="MarketPressureBriefV35-SPY"
        component={MarketPressureBriefV35 as React.ComponentType<any>}
        durationInFrames={720}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV35Input('SPY')}
      />

      <Composition
        id="MarketPressureBriefV35-NVDA"
        component={MarketPressureBriefV35 as React.ComponentType<any>}
        durationInFrames={720}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV35Input('NVDA')}
      />


      {/* ���� Shorts Engine V34 Alert Boot & GEX Rebuild (24.0s) ���� */}
      <Composition
        id="MarketPressureBriefV34"
        component={MarketPressureBriefV34 as React.ComponentType<any>}
        durationInFrames={720}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV34Input()}
      />

      {/* ���� Shorts Engine V33 Frame-0 Event Shock Fix ���� */}
      <Composition
        id="MarketPressureBriefV33"
        component={MarketPressureBriefV33 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV33Input()}
      />

      {/* ���� Shorts Engine V32 First-6-Seconds Revenue Lock Rebuild ���� */}
      <Composition
        id="MarketPressureBriefV32"
        component={MarketPressureBriefV32 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV32Input()}
      />

      {/* ���� Shorts Engine V31 Event Shock + Product Desire Rebuild ���� */}
      <Composition
        id="MarketPressureBriefV31"
        component={MarketPressureBriefV31 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV31Input()}
      />

      {/* ���� Shorts Engine V30 Intelligence Leak Revenue Cut ���� */}
      <Composition
        id="MarketPressureBriefV30"
        component={MarketPressureBriefV30 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV30Input()}
      />

      {/* ���� Shorts Engine V29 Premium Intelligence Revenue Cut ���� */}
      <Composition
        id="MarketPressureBriefV29"
        component={MarketPressureBriefV29 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV29Input()}
      />

      {/* ���� Shorts Engine V28 Revenue-Grade Viewer Lock-in Rebuild ���� */}
      <Composition
        id="MarketPressureBriefV28"
        component={MarketPressureBriefV28 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV28Input()}
      />

      {/* ���� Shorts Engine V27 Collision-Free Institutional Upload Master ���� */}
      <Composition
        id="MarketPressureBriefV27"
        component={MarketPressureBriefV27 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV27Input()}
      />

      <Composition
        id="FacelessShortsV4"
        component={FacelessShortsV4 as React.ComponentType<any>}
        durationInFrames={15 * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          bgImage: '/flux_bg.png',
          ticker: 'TSLA',
          captions: [
            { text: "STOP", startFrame: 0, endFrame: 15, highlight: true },
            { text: "SCROLLING!", startFrame: 15, endFrame: 45, highlight: true },
            { text: "WHILE YOU", startFrame: 45, endFrame: 60 },
            { text: "WATCHED", startFrame: 60, endFrame: 75 },
            { text: "NVIDIA,", startFrame: 75, endFrame: 105 },
            { text: "INSTITUTIONS", startFrame: 105, endFrame: 135, highlight: true },
            { text: "MOVED", startFrame: 135, endFrame: 150 },
            { text: "$125", startFrame: 150, endFrame: 165, highlight: true },
            { text: "MILLION", startFrame: 165, endFrame: 195, highlight: true },
            { text: "INTO", startFrame: 195, endFrame: 210 },
            { text: "TESLA", startFrame: 210, endFrame: 240, highlight: true },
            { text: "DARK POOLS", startFrame: 240, endFrame: 270, highlight: true },
            { text: "AT 68%.", startFrame: 270, endFrame: 330 },
            { text: "GAMMA", startFrame: 330, endFrame: 350, highlight: true },
            { text: "SQUEEZE", startFrame: 350, endFrame: 380, highlight: true },
            { text: "LOADING.", startFrame: 380, endFrame: 450 }
          ]
        }}
      />
      {/* �� Market Pulse V3 ? ���̺긮�� 6�� Shorts (30��) */}
      <Composition
        id="MarketPulseV3"
        component={MarketPulseV3 as React.ComponentType<any>}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          lang: 'en',
          date: new Date().toISOString().split('T')[0],
          ticker: 'SPY',
          tickerName: 'S&P 500 ETF',
          price: '585.00',
          change: '+0.84',
          gexRegime: 'POSITIVE',
          gexLabel: 'NEGATIVE �� POSITIVE',
          darkPool: 39.2,
          buyRatio: 34,
          sellRatio: 65,
          spy: 0.84,
          qqq: 1.71,
          vix: 18.2,
          insight1: '',
          insight2: '',
          insight3: '',
          bgmUrl: '',
          narrationUrl: '',
        }}
      />

      {/* Market Pulse V2 ? ���Ž� (30��) */}
      <Composition
        id="MarketPulse"
        component={MarketPulseVideo as React.ComponentType<any>}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          spy: -1.2,
          qqq: -0.8,
          vix: 18.5,
          gexRegime: 'positive',
          darkPool: 42.3,
          callWall: 590,
          putFloor: 570,
          lang: 'en',
          bgmUrl: '',
          narrationUrl: '',
        }}
      />

      {/* News Digest ? ���� + ���� ���� (30��) */}
      <Composition
        id="NewsDigest"
        component={NewsDigestVideo as React.ComponentType<any>}
        durationInFrames={30 * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          headlines: [
            { title: 'Fed signals rate pause', sentiment: 'neutral' },
            { title: 'NVDA earnings beat expectations', sentiment: 'positive' },
            { title: 'China tariff tensions escalate', sentiment: 'negative' },
          ],
          spy: -1.2,
          vix: 18.5,
          lang: 'en',
          bgmUrl: '',
          narrationUrl: '',
        }}
      />

      {/* Event Spike ? ���/GEX �̺�Ʈ (15��) */}
      <Composition
        id="EventSpike"
        component={EventSpikeVideo as React.ComponentType<any>}
        durationInFrames={15 * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          ticker: 'SPY',
          eventType: 'whale',
          details: '$2.5M Call sweep at $590 strike',
          premium: 2500000,
          spy: -1.2,
          gexRegime: 'positive',
          lang: 'en',
          bgmUrl: '',
        }}
      />

      {/* ���� Shorts Engine V9A: MarketPressureBrief (22.0s, aggressive cutdown) ���� */}
      <Composition
        id="MarketPressureBrief"
        component={MarketPressureBrief as React.ComponentType<any>}
        durationInFrames={660}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV9AInput()}
      />

      {/* ���� Shorts Engine V10: Keyframe Review ���� */}
      <Composition
        id="MarketPressureKeyframesV10"
        component={MarketPressureKeyframesV10}
        durationInFrames={7}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* ���� Shorts Engine V11: Final Audio Mix ���� */}
      <Composition
        id="MarketPressureBriefV11"
        component={MarketPressureBriefV11 as React.ComponentType<any>}
        durationInFrames={630}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV11Input()}
      />

      {/* ���� Shorts Engine V12 Variants ���� */}
      <Composition
        id="MarketPressureBriefV12A"
        component={MarketPressureBriefV12A as React.ComponentType<any>}
        durationInFrames={630}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV12AInput()}
      />
      <Composition
        id="MarketPressureBriefV12B"
        component={MarketPressureBriefV12B as React.ComponentType<any>}
        durationInFrames={630}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV12BInput()}
      />
      <Composition
        id="MarketPressureBriefV12C"
        component={MarketPressureBriefV12C as React.ComponentType<any>}
        durationInFrames={630}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV12CInput()}
      />

      {/* ���� Shorts Engine V13 Hybrid Winner ���� */}
      <Composition
        id="MarketPressureBriefV13"
        component={MarketPressureBriefV13 as React.ComponentType<any>}
        durationInFrames={645}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV13Input()}
      />

      {/* ���� Shorts Engine V14 Upload Candidate ���� */}
      <Composition
        id="MarketPressureBriefV14"
        component={MarketPressureBriefV14 as React.ComponentType<any>}
        durationInFrames={615}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV14Input()}
      />

      {/* ���� Shorts Engine V14.1 Final Hook Hierarchy ���� */}
      <Composition
        id="MarketPressureBriefV14-1"
        component={MarketPressureBriefV14_1 as React.ComponentType<any>}
        durationInFrames={615}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV14_1Input()}
      />

      {/* ���� Shorts Engine V15 Creative Rebuild ���� */}
      <Composition
        id="MarketPressureBriefV15"
        component={MarketPressureBriefV15 as React.ComponentType<any>}
        durationInFrames={615}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV15Input()}
      />

      {/* ���� Shorts Engine V16 Upload Candidate ���� */}
      <Composition
        id="MarketPressureBriefV16"
        component={MarketPressureBriefV16 as React.ComponentType<any>}
        durationInFrames={615}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV16Input()}
      />

      {/* ���� Shorts Engine V16.1 Audio Truth Candidate ���� */}
      <Composition
        id="MarketPressureBriefV16-1"
        component={MarketPressureBriefV16_1 as React.ComponentType<any>}
        durationInFrames={615}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV16_1Input()}
      />

      {/* ���� Shorts Engine V16.2 Visual Authority Fix ���� */}
      <Composition
        id="MarketPressureBriefV16-2"
        component={MarketPressureBriefV16_2 as React.ComponentType<any>}
        durationInFrames={615}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV16_2Input()}
      />

      {/* ���� Shorts Engine V17 Revenue-Grade Rebuild ���� */}
      <Composition
        id="MarketPressureBriefV17"
        component={MarketPressureBriefV17 as React.ComponentType<any>}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV17Input()}
      />

      {/* ���� Shorts Engine V18 Upload Candidate Rebuild ���� */}
      <Composition
        id="MarketPressureBriefV18"
        component={MarketPressureBriefV18 as React.ComponentType<any>}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV18Input()}
      />

      {/* ���� Shorts Engine V19 True Upload Candidate ���� */}
      <Composition
        id="MarketPressureBriefV19"
        component={MarketPressureBriefV19 as React.ComponentType<any>}
        durationInFrames={570}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV19Input()}
      />

      {/* ���� Shorts Engine V20 Institutional Footprint ���� */}
      <Composition
        id="MarketPressureBriefV20"
        component={MarketPressureBriefV20 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV20Input()}
      />

      {/* ���� Shorts Engine V21 Event-Driven Rebuild ���� */}
      <Composition
        id="MarketPressureBriefV21"
        component={MarketPressureBriefV21 as React.ComponentType<any>}
        durationInFrames={525}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV21Input()}
      />

      {/* ���� Shorts Engine V21.1 Surgical Fix ���� */}
      <Composition
        id="MarketPressureBriefV21-1"
        component={MarketPressureBriefV21_1 as React.ComponentType<any>}
        durationInFrames={525}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV21_1Input()}
      />

      {/* ���� Shorts Engine V21.2 Collision-Free ���� */}
      <Composition
        id="MarketPressureBriefV21-2"
        component={MarketPressureBriefV21_2 as React.ComponentType<any>}
        durationInFrames={525}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV21_2Input()}
      />

      {/* ���� Shorts Engine V22 Event-First Revenue Cut ���� */}
      <Composition
        id="MarketPressureBriefV22"
        component={MarketPressureBriefV22 as React.ComponentType<any>}
        durationInFrames={525}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV22Input()}
      />

      {/* ���� Shorts Engine V23 Bloomberg-Alert Revenue Cut ���� */}
      <Composition
        id="MarketPressureBriefV23"
        component={MarketPressureBriefV23 as React.ComponentType<any>}
        durationInFrames={525}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV23Input()}
      />

      {/* ���� Shorts Engine V24 Intelligence-UI Rebuild ���� */}
      <Composition
        id="MarketPressureBriefV24"
        component={MarketPressureBriefV24 as React.ComponentType<any>}
        durationInFrames={534}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV24Input()}
      />

      {/* ���� Shorts Engine V25 Cinematic 28s Magic Prototype ���� */}
      <Composition
        id="MarketPressureBriefV25"
        component={MarketPressureBriefV25 as React.ComponentType<any>}
        durationInFrames={840}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV25Input()}
      />

      {/* ���� Shorts Engine V26 Institutional Data-First Revenue Cut ���� */}
      <Composition
        id="MarketPressureBriefV26"
        component={MarketPressureBriefV26 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV26Input()}
      />
      {/* 채널 트레일러 — 「왜 구독해야 하는가」. 쇼츠가 아니므로 30초 상한 대상 아님 */}
      {/* 일본 채널 브랜드 자산 — 정지 이미지로 뽑아 쓴다 (still 렌더) */}
      <Composition id="JPAvatar" component={JPAvatar} durationInFrames={1} fps={30} width={800} height={800} />
      <Composition id="JPBanner" component={JPBanner} durationInFrames={1} fps={30} width={2560} height={1440} />
      <Composition
        id="Trailer"
        component={Trailer}
        durationInFrames={TRAILER_FRAMES}
        fps={TRAILER_FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="OutroCard"
        component={OutroCard}
        durationInFrames={OUTRO_FRAMES}
        fps={OUTRO_FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="Concept2RSI"
        component={Concept2}
        durationInFrames={C2_DURATION}
        fps={C2_FPS}
        width={1080}
        height={1920}
      />
      {/* ★ Race — 우리 틀을 버리고 «터진 뼈대» 그대로 만든 첫 편 (2026-08-22) */}
      <Composition
        id="RaceChip1Y"
        component={Race as React.ComponentType<any>}
        durationInFrames={raceDuration(RACE_CHIP1Y)}
        fps={RACE_FPS}
        width={1080}
        height={1920}
        defaultProps={RACE_CHIP1Y as any}
      />

      <Composition
        id="RaceNvdaIntc"
        component={Race as React.ComponentType<any>}
        durationInFrames={raceDuration(RACE_NVDA_INTC)}
        fps={RACE_FPS}
        width={1080}
        height={1920}
        defaultProps={RACE_NVDA_INTC as any}
      />
      <Composition
        id="RaceAmdIntc"
        component={Race as React.ComponentType<any>}
        durationInFrames={raceDuration(RACE_AMD_INTC)}
        fps={RACE_FPS}
        width={1080}
        height={1920}
        defaultProps={RACE_AMD_INTC as any}
      />
      <Composition
        id="RaceNvdaAapl"
        component={Race as React.ComponentType<any>}
        durationInFrames={raceDuration(RACE_NVDA_AAPL)}
        fps={RACE_FPS}
        width={1080}
        height={1920}
        defaultProps={RACE_NVDA_AAPL as any}
      />
      <Composition
        id="RaceJpNvdaIntc"
        component={Race as React.ComponentType<any>}
        durationInFrames={raceDuration(RACE_JP_NVDA_INTC)}
        fps={RACE_FPS}
        width={1080}
        height={1920}
        defaultProps={RACE_JP_NVDA_INTC as any}
      />
      <Composition
        id="StatChips"
        component={Stat as React.ComponentType<any>}
        durationInFrames={statDuration(STAT_CHIPS)}
        fps={STAT_FPS}
        width={1080}
        height={1920}
        defaultProps={STAT_CHIPS as any}
      />
      <Composition
        id="StatJpChips"
        component={Stat as React.ComponentType<any>}
        durationInFrames={statDuration(STAT_JP_CHIPS)}
        fps={STAT_FPS}
        width={1080}
        height={1920}
        defaultProps={STAT_JP_CHIPS as any}
      />
      <Composition
        id="RaceJpSpyNvda"
        component={Race as React.ComponentType<any>}
        durationInFrames={raceDuration(RACE_JP_SPY_NVDA)}
        fps={RACE_FPS}
        width={1080}
        height={1920}
        defaultProps={RACE_JP_SPY_NVDA as any}
      />
    </>
  );
};

