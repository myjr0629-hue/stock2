// ============================================================================
// Remotion Root — 모든 Composition 등록 (V3 Hybrid)
// ============================================================================

import React from 'react';
import { Composition } from 'remotion';
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
import { SCRIPT_T1, SCRIPT_FLIP } from './kit/scripts';
import { SAMPLE_BRIEFING } from './data/sampleBriefing';


export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ══ 신규 라인 — 「SIGNUM 브리핑」. 정본 .agent/VIDEO_ENGINE_SPEC.md ══
          기존 V10–V37 42종은 폐기 결정(대표 지시). 이것이 데일리 3편의 본체다. */}
      <Composition
        id="BriefingV1"
        component={BriefingV1 as React.ComponentType<any>}
        durationInFrames={BRIEFING_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING}
      />

      {/* V2 — 이야기 구조 + 상시 자막 + 밝기 밴드 고정. V1의 «수치나열·번쩍임» 재설계 */}
      <Composition
        id="BriefingV2"
        component={BriefingV2 as React.ComponentType<any>}
        durationInFrames={BRIEFING2_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING_2}
      />

      {/* V3 — 풀블리드 실사 배경 + 거대 앰버 헤드라인 + 리서치 차트 (레퍼런스 구조)
          + 훅 우선(타이틀 카드 제거) — 숏폼 리텐션 조사 반영 */}
      <Composition
        id="BriefingV3"
        component={BriefingV3 as React.ComponentType<any>}
        durationInFrames={BRIEFING3_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING_3}
      />

      {/* V4 — 완성본. 커리오시티 루프 + 리텐션 루프백 + 상시 자막 + 실사 배경 */}
      <Composition
        id="BriefingV4"
        component={BriefingV4 as React.ComponentType<any>}
        durationInFrames={BRIEFING4_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING_4}
      />

      {/* V5 — 뉴스 → 종목 → 파급 → 우리 데이터. 날짜 배지 + 중앙 채움 + 앱화면 잘림 해결 */}
      <Composition
        id="BriefingV5"
        component={BriefingV5 as React.ComponentType<any>}
        durationInFrames={BRIEFING5_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING_5}
      />

      {/* V6 — 경제사냥꾼 차용: 고정배너·날짜·자막3초·핵심어색·빨간네모·질문CTA */}
      <Composition
        id="BriefingV6"
        component={BriefingV6 as React.ComponentType<any>}
        durationInFrames={BRIEFING6_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING_6}
      />

      {/* V7 — V5 화면 + 연쇄 커리오시티 루프 대본 (각 컷이 답하지 않는 질문을 남긴다) */}
      <Composition
        id="BriefingV7"
        component={BriefingV7 as React.ComponentType<any>}
        durationInFrames={BRIEFING7_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SAMPLE_BRIEFING_7}
      />

      {/* ★ 정본 템플릿 — 대본(kit/scripts)만 바꾸면 다른 영상이 된다 */}
      <Composition
        id="Briefing"
        component={Briefing as React.ComponentType<any>}
        durationInFrames={durationOf(SCRIPT_T1)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SCRIPT_T1}
      />

      {/* ★ 42초판 — 절차 배경 + 콜아웃 + 컨센서스 인용 (2026-08-06 실측 대본) */}
      <Composition
        id="BriefingFlip"
        component={Briefing as React.ComponentType<any>}
        durationInFrames={durationOf(SCRIPT_FLIP)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={SCRIPT_FLIP}
      />

      {/* ── Shorts Engine V37 Real-Time SSoT Premium Rebuild (24.633s, 739 frames) ── */}
      <Composition
        id="MarketPressureBriefV37-NVDA"
        component={MarketPressureBriefV37 as React.ComponentType<any>}
        durationInFrames={739}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV37Input()}
      />

      {/* ── Shorts Engine V36 SSoT Rebuild (17.868s, 536 frames) ── */}
      <Composition
        id="MarketPressureBriefV36-SPY"
        component={MarketPressureBriefV36 as React.ComponentType<any>}
        durationInFrames={536}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV36Input()}
      />
      {/* ── Shorts Engine V35 데일리 모닝 특보 & 3-Shorts 분화 체계 (24.0s) ── */}
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


      {/* ── Shorts Engine V34 Alert Boot & GEX Rebuild (24.0s) ── */}
      <Composition
        id="MarketPressureBriefV34"
        component={MarketPressureBriefV34 as React.ComponentType<any>}
        durationInFrames={720}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV34Input()}
      />

      {/* ── Shorts Engine V33 Frame-0 Event Shock Fix ── */}
      <Composition
        id="MarketPressureBriefV33"
        component={MarketPressureBriefV33 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV33Input()}
      />

      {/* ── Shorts Engine V32 First-6-Seconds Revenue Lock Rebuild ── */}
      <Composition
        id="MarketPressureBriefV32"
        component={MarketPressureBriefV32 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV32Input()}
      />

      {/* ── Shorts Engine V31 Event Shock + Product Desire Rebuild ── */}
      <Composition
        id="MarketPressureBriefV31"
        component={MarketPressureBriefV31 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV31Input()}
      />

      {/* ── Shorts Engine V30 Intelligence Leak Revenue Cut ── */}
      <Composition
        id="MarketPressureBriefV30"
        component={MarketPressureBriefV30 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV30Input()}
      />

      {/* ── Shorts Engine V29 Premium Intelligence Revenue Cut ── */}
      <Composition
        id="MarketPressureBriefV29"
        component={MarketPressureBriefV29 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV29Input()}
      />

      {/* ── Shorts Engine V28 Revenue-Grade Viewer Lock-in Rebuild ── */}
      <Composition
        id="MarketPressureBriefV28"
        component={MarketPressureBriefV28 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV28Input()}
      />

      {/* ── Shorts Engine V27 Collision-Free Institutional Upload Master ── */}
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
      {/* ★ Market Pulse V3 — 하이브리드 6씬 Shorts (30초) */}
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
          gexLabel: 'NEGATIVE → POSITIVE',
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

      {/* Market Pulse V2 — 레거시 (30초) */}
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

      {/* News Digest — 뉴스 + 시장 반응 (30초) */}
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

      {/* Event Spike — 고래/GEX 이벤트 (15초) */}
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

      {/* ── Shorts Engine V9A: MarketPressureBrief (22.0s, aggressive cutdown) ── */}
      <Composition
        id="MarketPressureBrief"
        component={MarketPressureBrief as React.ComponentType<any>}
        durationInFrames={660}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV9AInput()}
      />

      {/* ── Shorts Engine V10: Keyframe Review ── */}
      <Composition
        id="MarketPressureKeyframesV10"
        component={MarketPressureKeyframesV10}
        durationInFrames={7}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* ── Shorts Engine V11: Final Audio Mix ── */}
      <Composition
        id="MarketPressureBriefV11"
        component={MarketPressureBriefV11 as React.ComponentType<any>}
        durationInFrames={630}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV11Input()}
      />

      {/* ── Shorts Engine V12 Variants ── */}
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

      {/* ── Shorts Engine V13 Hybrid Winner ── */}
      <Composition
        id="MarketPressureBriefV13"
        component={MarketPressureBriefV13 as React.ComponentType<any>}
        durationInFrames={645}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV13Input()}
      />

      {/* ── Shorts Engine V14 Upload Candidate ── */}
      <Composition
        id="MarketPressureBriefV14"
        component={MarketPressureBriefV14 as React.ComponentType<any>}
        durationInFrames={615}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV14Input()}
      />

      {/* ── Shorts Engine V14.1 Final Hook Hierarchy ── */}
      <Composition
        id="MarketPressureBriefV14-1"
        component={MarketPressureBriefV14_1 as React.ComponentType<any>}
        durationInFrames={615}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV14_1Input()}
      />

      {/* ── Shorts Engine V15 Creative Rebuild ── */}
      <Composition
        id="MarketPressureBriefV15"
        component={MarketPressureBriefV15 as React.ComponentType<any>}
        durationInFrames={615}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV15Input()}
      />

      {/* ── Shorts Engine V16 Upload Candidate ── */}
      <Composition
        id="MarketPressureBriefV16"
        component={MarketPressureBriefV16 as React.ComponentType<any>}
        durationInFrames={615}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV16Input()}
      />

      {/* ── Shorts Engine V16.1 Audio Truth Candidate ── */}
      <Composition
        id="MarketPressureBriefV16-1"
        component={MarketPressureBriefV16_1 as React.ComponentType<any>}
        durationInFrames={615}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV16_1Input()}
      />

      {/* ── Shorts Engine V16.2 Visual Authority Fix ── */}
      <Composition
        id="MarketPressureBriefV16-2"
        component={MarketPressureBriefV16_2 as React.ComponentType<any>}
        durationInFrames={615}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV16_2Input()}
      />

      {/* ── Shorts Engine V17 Revenue-Grade Rebuild ── */}
      <Composition
        id="MarketPressureBriefV17"
        component={MarketPressureBriefV17 as React.ComponentType<any>}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV17Input()}
      />

      {/* ── Shorts Engine V18 Upload Candidate Rebuild ── */}
      <Composition
        id="MarketPressureBriefV18"
        component={MarketPressureBriefV18 as React.ComponentType<any>}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV18Input()}
      />

      {/* ── Shorts Engine V19 True Upload Candidate ── */}
      <Composition
        id="MarketPressureBriefV19"
        component={MarketPressureBriefV19 as React.ComponentType<any>}
        durationInFrames={570}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV19Input()}
      />

      {/* ── Shorts Engine V20 Institutional Footprint ── */}
      <Composition
        id="MarketPressureBriefV20"
        component={MarketPressureBriefV20 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV20Input()}
      />

      {/* ── Shorts Engine V21 Event-Driven Rebuild ── */}
      <Composition
        id="MarketPressureBriefV21"
        component={MarketPressureBriefV21 as React.ComponentType<any>}
        durationInFrames={525}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV21Input()}
      />

      {/* ── Shorts Engine V21.1 Surgical Fix ── */}
      <Composition
        id="MarketPressureBriefV21-1"
        component={MarketPressureBriefV21_1 as React.ComponentType<any>}
        durationInFrames={525}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV21_1Input()}
      />

      {/* ── Shorts Engine V21.2 Collision-Free ── */}
      <Composition
        id="MarketPressureBriefV21-2"
        component={MarketPressureBriefV21_2 as React.ComponentType<any>}
        durationInFrames={525}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV21_2Input()}
      />

      {/* ── Shorts Engine V22 Event-First Revenue Cut ── */}
      <Composition
        id="MarketPressureBriefV22"
        component={MarketPressureBriefV22 as React.ComponentType<any>}
        durationInFrames={525}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV22Input()}
      />

      {/* ── Shorts Engine V23 Bloomberg-Alert Revenue Cut ── */}
      <Composition
        id="MarketPressureBriefV23"
        component={MarketPressureBriefV23 as React.ComponentType<any>}
        durationInFrames={525}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV23Input()}
      />

      {/* ── Shorts Engine V24 Intelligence-UI Rebuild ── */}
      <Composition
        id="MarketPressureBriefV24"
        component={MarketPressureBriefV24 as React.ComponentType<any>}
        durationInFrames={534}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV24Input()}
      />

      {/* ── Shorts Engine V25 Cinematic 28s Magic Prototype ── */}
      <Composition
        id="MarketPressureBriefV25"
        component={MarketPressureBriefV25 as React.ComponentType<any>}
        durationInFrames={840}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV25Input()}
      />

      {/* ── Shorts Engine V26 Institutional Data-First Revenue Cut ── */}
      <Composition
        id="MarketPressureBriefV26"
        component={MarketPressureBriefV26 as React.ComponentType<any>}
        durationInFrames={555}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={createMockMarketPressureBriefV26Input()}
      />
    </>
  );
};
