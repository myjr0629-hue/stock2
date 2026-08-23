/**
 * Race — 「두 대상 + 시간 누적」. 터진 영상 8편을 픽셀로 재서 뽑아낸 뼈대 그대로다.
 * ---------------------------------------------------------------------------
 * ⛔ 이 파일은 우리 기존 틀(Briefing·Versus)을 «쓰지 않는다». 대표 지시 2026-08-22:
 *   "우리의 틀을 버리고 해야한다 잘되는것을"
 *
 * ── 실측 근거 (2026-08-22 · 폭발작 8편을 내려받아 프레임 단위로 측정) ─────────
 *   상단 22% 영역이 영상 내내 «정지» 한 비율
 *     Jeremy 166만 100% · Rolex 8,145배 99% · AssetVsTime 271배 100%
 *     Finvesto 980만 100% · ValueSignals 2,377만 100% · Wealthrive 1억 100%
 *     ⇒ 8편 중 8편이 97~100%.   우리 기존 영상은 0~25% 였다.
 *   컷 수 : 레퍼런스 0~1개.   우리 기존 영상은 8개(2.6초마다).
 *
 * ── 그래서 이 컴포넌트가 지키는 규칙 4개 ──────────────────────────────────
 *   ① 상단 제목 띠는 첫 프레임부터 마지막까지 «단 1픽셀도» 바뀌지 않는다.
 *      (쇼츠는 중간에 걸린다. 언제 들어와도 무슨 영상인지 보여야 한다)
 *   ② 컷 0개. 전 구간이 하나의 연속 장면이다.
 *   ③ 움직이는 곳은 «한 곳» — 두 기둥이 자라고 그 옆에 숫자가 쌓인다.
 *   ④ 글자는 상단 제목 + 티커 라벨 + 연도·금액. 그 외엔 아무것도 얹지 않는다.
 *      ⛔ 섹션 헤더·하단 티커바·면책 스크롤·자막 박스 전부 없다. 그게 우리를 죽였다.
 *
 * ⛔ 숫자는 전부 실측이다 (.agent/_race.json · FMP 분할조정 종가).
 *   이 포맷은 숫자가 진짜라야 산다. 반올림해서 «있어 보이게» 만들지 않는다.
 */

import React from 'react';
import {
  AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig,
  staticFile, Easing, Audio,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadJP } from '@remotion/google-fonts/NotoSansJP';

const { fontFamily } = loadFont();
// ⛔ Montserrat 에는 일본어 글리프가 없다. 일본판은 반드시 NotoSansJP 를 써야 한다
//   (안 그러면 두부(□)만 나온다). 2026-08-23 렌더로 확인.
const { fontFamily: fontJP } = loadJP();

export const RACE_FPS = 30;

export type RaceRow = { y: number; a: number; b: number };
export type RaceProps = {
  /** 상단 고정 제목 2줄 — 영상 내내 안 바뀐다 */
  title: [string, string];
  /** 왼쪽 대상 */
  a: { sym: string; name: string; color: string };
  /** 오른쪽 대상 */
  b: { sym: string; name: string; color: string };
  /** 연도별 실측 금액 */
  rows: RaceRow[];
  /** 시작 투자금 (라벨용) */
  seed: string;
  /** 통화 표기 — 일본판은 «円», 미국판은 «$». ⛔ cur 는 내부에서 «현재 행» 으로 쓰여 이름이 다르다 */
  currency?: 'usd' | 'jpy';
  /** 하단 고정 문구 (기본은 영어). 일본판은 일본어로 넣는다 */
  footnote?: string;
  /** 일본어면 true — 폰트가 바뀐다 */
  jp?: boolean;
  /** 한 해가 넘어가는 데 걸리는 초 */
  stepSec?: number;
  /** 마지막 결과를 붙잡고 있는 초 */
  holdSec?: number;
  music?: string;
};

const money = (n: number) => '$' + n.toLocaleString('en-US');

/** 이 영상의 총 길이 — 연도 수로 정해진다 */
export const raceDuration = (p: RaceProps) =>
  Math.round(((p.rows.length - 1) * (p.stepSec ?? 1.1) + (p.holdSec ?? 3.2) + 0.6) * RACE_FPS);

export const Race: React.FC<RaceProps> = ({
  title, a, b, rows, seed, stepSec = 1.1, holdSec = 3.2, music,
  currency = 'usd', footnote, jp = false,
}) => {
  const FF = jp ? fontJP : fontFamily;
  // 일본은 «万» 단위로 읽는다. 1억 4034만엔 을 ¥140,339,900 으로 쓰면 안 읽힌다.
  const yen = (n: number) => {
    const oku = Math.floor(n / 1e8);
    const man = Math.floor((n % 1e8) / 1e4);
    if (oku > 0) return `${oku}億${man > 0 ? `${man.toLocaleString('ja-JP')}万` : ''}円`;
    return `${man.toLocaleString('ja-JP')}万円`;
  };
  const fmt = currency === 'jpy' ? yen : money;
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const t = frame / RACE_FPS;

  // ── 진행도 : 0 → rows.length-1 (연속값이라 기둥이 «부드럽게» 자란다) ──────
  const lead = 0.45;                                 // 시작 전 숨 고르기 (짧게)
  const prog = Math.max(0, Math.min(rows.length - 1, (t - lead) / stepSec));
  const idx = Math.floor(prog);
  const frac = prog - idx;
  const cur = rows[idx];
  const nxt = rows[Math.min(rows.length - 1, idx + 1)];
  const lerp = (x: number, y: number) => x + (y - x) * frac;
  const va = lerp(cur.a, nxt.a);
  const vb = lerp(cur.b, nxt.b);
  const year = Math.round(lerp(cur.y, nxt.y));

  // ── 축은 «로그» 다 ─────────────────────────────────────────────────────
  //   ⛔ 선형 축으로 처음 렌더했더니 NVDA 기둥이 15초 내내 천장에 붙어 «안 자라 보였다».
  //     55.9배 격차에서는 선두가 항상 최대값이라 선형으로는 움직임이 안 생긴다.
  //     Jeremy·Rolex 는 «사람 키» 라 축이 없고 둘 다 조금씩 자란다 — 그 느낌을 로그로 낸다.
  // ⛔ 로그 바닥을 «시작 금액의 1/10» 로 잡는다.
  //   0.55배로 잡았더니 첫 해(둘 다 $10,000)에서 기둥이 화면 바닥에 붙어,
  //   shorts-gate 가 「빈 화면 1.9초 @ 0s」로 잡았다. 그 지적이 옳다 —
  //   Jeremy·Rolex 는 첫 프레임부터 두 사람이 «같은 키로 이미 서 있다».
  //   바닥을 1/10 로 내리면 시작점이 한 자릿수만큼 올라와 처음부터 보인다.
  const FLOOR_V = rows[0].a / 10;
  const topV = Math.max(...rows.map((r) => Math.max(r.a, r.b)));
  const lg = (v: number) => Math.log10(Math.max(v, FLOOR_V) / FLOOR_V);
  const lgTop = lg(topV) * 1.06;
  const norm = (v: number) => lg(v) / lgTop;

  // ── 배치 ────────────────────────────────────────────────────────────────
  // ⛔ 두 번 고쳤다.
  //   1차: 목록을 기둥과 같은 세로줄에 뒀더니 후반부에 기둥이 목록을 «덮었다».
  //   2차: 목록을 위, 기둥을 아래로 갈랐더니 가운데가 비고 «중앙 활동 34» 로 밋밋해졌다
  //        (레퍼런스 Jeremy 55 · AssetVsTime 50).
  //   ⇒ Jeremy 원본대로 «대상은 화면을 꽉 채우고, 목록은 그 옆» 으로 간다.
  //     목록을 좌·우 가장자리로 밀고 두 기둥을 화면 한가운데 나란히 세운다.
  //     기둥이 붙어 있어야 격차가 «한눈에» 읽힌다 — 그게 이 포맷의 전부다.
  const PAD = 20;
  const TOP_H = 300;                                 // 고정 제목 띠 (절대 안 변함)
  const FLOOR = H - 270;                             // 기둥이 서는 바닥
  const CEIL = TOP_H + 170;                          // 기둥 최고 높이
  const SPAN = FLOOR - CEIL;
  // ⛔ 3차 수정: 기둥 간격 54 는 하단 금액 두 개가 «가로로 겹쳤다» ($23,34$9,828).
  //   목록 폭 292 는 $1,403,399 가 줄바꿈으로 깨졌다. 둘 다 실측해서 다시 잡은 값이다.
  const LIST_W = 255;                                // 좌·우 가장자리 목록 폭
  const barW = 140;
  const GAP = 240;                                   // 두 기둥 사이
  const cxA = W / 2 - GAP / 2 - barW / 2;
  const cxB = W / 2 + GAP / 2 + barW / 2;
  const colW = LIST_W;

  const hOf = (v: number) => Math.max(10, norm(v) * SPAN);

  // ⛔ 등장을 «투명도 0 → 1» 로 하지 않는다.
  //   shorts-gate 가 「빈 화면 1.93초 @ 0s」를 잡았고, 그 지적이 옳다.
  //   Jeremy·Rolex 는 첫 프레임부터 두 사람이 이미 서 있다 — 비는 순간이 없다.
  //   그래서 첫 프레임부터 «완전히 보이는 상태» 로 시작하고, 크기만 살짝 튀어오르게 한다.
  const intro = 1;
  const pop = interpolate(t, [0, 0.34], [0.86, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.4)),
  });

  const Column = (
    side: 'a' | 'b',
    o: { sym: string; name: string; color: string },
    val: number,
    cx: number,
  ) => {
    const bh = hOf(val) * pop;
    return (
      <>
        {/* 기둥 — 이 영상에서 «움직이는 유일한 것» */}
        <div style={{
          position: 'absolute', left: cx - barW / 2, top: FLOOR - bh,
          width: barW, height: bh,
          borderRadius: 18,
          background: `linear-gradient(180deg, ${o.color} 0%, ${o.color}CC 55%, ${o.color}77 100%)`,
          boxShadow: `0 0 60px ${o.color}55`,
          opacity: intro,
        }} />
        {/* 로고 — 기둥 «머리 위». 자라면 같이 올라간다 */}
        <div style={{
          position: 'absolute', left: cx - 62, top: FLOOR - bh - 152,
          width: 124, height: 124, borderRadius: 26, background: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 12px 40px rgba(0,0,0,.5)', opacity: intro,
        }}>
          <Img src={staticFile(`shorts/logos/${o.sym}.png`)}
               style={{ width: 92, height: 92, objectFit: 'contain' }} />
        </div>
        {/* 티커 이름 — 로고 위 */}
        {/* ⛔ 일본어 이름은 길다 — 「エヌビディア」가 260px·46px 에서 「エヌビディ」로 잘렸다.
            폭을 넓히고 글자를 줄인다. 기둥 간격(240)보다 넓으면 두 라벨이 겹치므로 340 이 상한이다. */}
        <div style={{
          position: 'absolute', left: cx - (jp ? 170 : 130), top: FLOOR - bh - 222,
          width: jp ? 340 : 260, textAlign: 'center', whiteSpace: 'nowrap',
          fontFamily: FF, fontWeight: 800, fontSize: jp ? 38 : 46, letterSpacing: jp ? 0 : 1,
          color: o.color, textShadow: '0 4px 22px rgba(0,0,0,.75)', opacity: intro,
        }}>{o.name}</div>
        {/* 현재 금액 — 기둥 아래. 계속 올라가는 숫자 */}
        {/* ⛔ 일본어 금액도 길다 — 「1億4,033万円」이 280px·52px 에서 두 줄로 깨져 연도와 겹쳤다.
            기둥 간격 240 + 폭 140 이므로 340 까지는 두 금액이 안 겹친다 (A 180~520 · B 560~900). */}
        <div style={{
          position: 'absolute', left: cx - (jp ? 170 : 140), top: FLOOR + 22,
          width: jp ? 340 : 280, textAlign: 'center', whiteSpace: 'nowrap',
          fontFamily: FF, fontWeight: 900, fontSize: jp ? 44 : 52,
          color: '#FFFFFF', textShadow: '0 4px 20px rgba(0,0,0,.8)',
          fontVariantNumeric: 'tabular-nums', opacity: intro,
        }}>{fmt(Math.round(val))}</div>

        {/* ⛔ Jeremy 166만회의 «움직임의 본체» 는 기둥이 아니라 이것이었다 —
            연도별 금액이 한 줄씩 «쌓인다». 지나온 해가 화면에 남아야 격차가 읽힌다. */}
        <div style={{
          position: 'absolute',
          left: side === 'a' ? PAD : W - PAD - LIST_W,
          top: TOP_H + 30,
          width: LIST_W, textAlign: side === 'a' ? 'left' : 'right',
          whiteSpace: 'nowrap',
          fontFamily: FF, fontWeight: 800, fontSize: 28, lineHeight: 1.46,
          color: 'rgba(255,255,255,.80)', fontVariantNumeric: 'tabular-nums',
          textShadow: '0 2px 10px rgba(0,0,0,.9)',
        }}>
          {rows.slice(0, idx + 1).map((r) => (
            <div key={r.y} style={{ opacity: r.y === cur.y ? Math.min(1, frac * 3 + 0.4) : 0.78 }}>
              <span style={{ color: 'rgba(255,255,255,.42)', fontSize: 22, fontWeight: 700 }}>{r.y}</span>
              {'  '}
              <span style={{ color: o.color }}>
                {fmt(side === 'a' ? r.a : r.b)}
              </span>
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <AbsoluteFill style={{ background: '#0A0D14', fontFamily: FF }}>
      {/* 바닥선 — 두 기둥이 «같은 곳에서 출발했다»는 것을 보여준다 */}
      <div style={{
        position: 'absolute', left: cxA - barW / 2 - 30, top: FLOOR,
        width: (cxB + barW / 2 + 30) - (cxA - barW / 2 - 30), height: 3,
        background: 'rgba(255,255,255,.22)',
      }} />

      {Column('a', a, va, cxA)}
      {Column('b', b, vb, cxB)}

      {/* ══ 상단 고정 띠 ══
          ⛔ 여기는 첫 프레임부터 끝까지 «절대» 바뀌지 않는다. frame 을 참조하지 않는다.
             레퍼런스 8편 전부가 이 자리를 100% 고정해 뒀다. */}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: W, height: TOP_H,
        background: 'linear-gradient(180deg,#000 0%,#000 74%,rgba(0,0,0,0) 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        paddingLeft: PAD, paddingRight: PAD, paddingBottom: 46,
      }}>
        <div style={{ fontWeight: 900, fontSize: jp ? 56 : 62, lineHeight: 1.14, color: '#FFFFFF' }}>
          {title[0]}
        </div>
        <div style={{ fontWeight: 900, fontSize: jp ? 56 : 62, lineHeight: 1.14, color: '#FFB020', marginTop: 4 }}>
          {title[1]}
        </div>
      </div>

      {/* ══ 핸들 각인 ══
          ⛔ 브랜딩을 «로고 크게» 로 하지 않는다 (2026-08-23 실측).
             폭발작 8편 중 브랜드 표시가 있는 것은 2편뿐이고, 둘 다 «거의 안 보일 만큼» 작다:
               Life in Focus  제목 바로 아래 「YOUTUBE | @LIFEINFOCUS-1」 흐린 손글씨체
               TheWealthrive  클립 하단 중앙 반투명 「W」 모노그램
             나머지 6편은 표시가 아예 없다.
             ⇒ 이 채널들의 브랜딩은 로고가 아니라 «매 편 똑같은 상단 띠» 다. 그게 서명이다.
             우리 서명 = 흰 줄 + 앰버(#FFB020) 줄 · Montserrat 900 · 매 편 동일.
             핸들은 그 아래 «작고 흐리게» 만 둔다 — 콘텐츠 자리를 뺏지 않는다. */}
      <div style={{
        position: 'absolute', left: PAD, top: TOP_H - 44, width: W - PAD * 2,
        fontFamily: FF, fontWeight: 700, fontSize: 21, letterSpacing: 2.4,
        color: 'rgba(255,255,255,.30)',
      }}>@SIGNUMHQ</div>

      {/* 연도 — 하단 «한 곳». 자리는 고정이고 숫자만 바뀐다 */}
      <div style={{
        position: 'absolute', left: 0, top: H - 168, width: W, textAlign: 'center',
        fontWeight: 900, fontSize: 88, letterSpacing: 4,
        color: 'rgba(255,255,255,.94)', fontVariantNumeric: 'tabular-nums',
      }}>{year}</div>

      {/* 시작 조건 — 고정. 이게 없으면 숫자의 의미가 없다 */}
      <div style={{
        position: 'absolute', left: 0, top: H - 74, width: W, textAlign: 'center',
        fontWeight: 700, fontSize: 34, color: 'rgba(255,255,255,.46)',
      }}>{footnote ?? `${seed} invested in ${rows[0].y}`}</div>

      {music ? <Audio src={staticFile(music)} volume={0.82} /> : null}
    </AbsoluteFill>
  );
};
