'use client';

// ============================================================================
// ShareLanding — «공유 링크로 들어온 사람»에게만 보이는 설치 안내 한 줄 (2026-09-29).
//
// · 서버가 `from=share` 를 보고 «이 요청에만» 렌더한다 → 일반 방문자·앱 화면은 그대로다.
//   (서버에서 그리므로 하이드레이션 뒤 튀어나오는 레이아웃 흔들림이 없다)
// · 버튼은 기존 스마트링크 그대로: /app·/app-uc·/app-wim ?from=share → 기존 집계
//   mkt:attr:hit:share:<ET날짜> + 기기별 칸이 센다. 스토어로 가는 길은 한 줄도 안 바꿨다.
// · 퍼널 비콘(open·click)은 EC2 전용 키로 간다(Upstash 무증가) — /api/share-hit.
// · variant: card = SIGNUM 공개 페이지(밝은 SEO 페이지) 본문 맨 위 카드
//            bar  = UC·WIM 앱 페이지 맨 위 띠(앱 화면 위에 얹는다)
// ============================================================================

import { useEffect } from 'react';
import { shareBeacon, type ShareSurface } from '@/lib/share/share';

type App = 'signum' | 'uc' | 'wim';
type Loc = 'en' | 'ko' | 'ja';

const APP_PATH: Record<App, string> = { signum: '/app', uc: '/app-uc', wim: '/app-wim' };
// 72px(표시 36px × 2) 전용본 — 원본은 1024px·최대 445KB 라 한 줄 배너에 싣기엔 무겁다.
const ICON: Record<App, string> = {
  signum: '/app-icons/signum-72.png',
  uc: '/app-icons/uc-72.png',
  wim: '/app-icons/wim-72.png',
};

// 문구는 «누가 보냈는지» + «무엇인지» + «무료». 예측·권유 표현 없음(스토어·플랫폼 공통 안전선).
// 길이는 375px 에서 세 언어 모두 말줄임 없이 들어가게 잡았다(2026-09-29 프리뷰 실측 — 영어 원안이 잘렸다).
const COPY: Record<App, Record<Loc, { kicker: string; line: string }>> = {
  // SIGNUM 은 «카드»(본문 안, 좌우 여백 20)라 글 칸이 가장 좁다(375px 에서 약 155px) — 가장 짧게
  signum: {
    en: { kicker: 'Shared from SIGNUM HQ', line: 'The US market, free' },
    ko: { kicker: 'SIGNUM HQ 앱에서 공유된 화면', line: '미국 시장을 무료 앱 하나로' },
    ja: { kicker: 'SIGNUM HQ アプリから共有', line: '米国市場を無料アプリで' },
  },
  uc: {
    en: { kicker: 'Shared from Undercurrent', line: 'The news behind the money' },
    ko: { kicker: 'Undercurrent 앱에서 공유된 이야기', line: '헤드라인 옆에 «돈이 한 일»을' },
    ja: { kicker: 'Undercurrent アプリから共有', line: 'ニュースの裏のお金の動き' },
  },
  wim: {
    en: { kicker: "Shared from Why'd It Move?", line: 'The 30-second market quiz' },
    ko: { kicker: "Why'd It Move? 앱에서 공유된 문제", line: '실제 움직임을 30초 퀴즈로' },
    ja: { kicker: "Why'd It Move? アプリから共有", line: '本物の値動きを30秒クイズで' },
  },
};
const CTA: Record<Loc, string> = { en: 'Get the app', ko: '무료 앱 받기', ja: '無料で入手' };

const THEME: Record<App, { bg: string; fg: string; btnBg: string; btnFg: string }> = {
  signum: { bg: '#17191E', fg: '#FFFFFF', btnBg: '#FFFFFF', btnFg: '#17191E' },
  uc: { bg: '#17191E', fg: '#F6F3ED', btnBg: '#F6F3ED', btnFg: '#17191E' },
  wim: { bg: 'linear-gradient(135deg, #6C5CE7 0%, #8B7CF7 100%)', fg: '#FFFFFF', btnBg: '#FFFFFF', btnFg: '#4C3FAF' },
};

// 로케일 재이동(UC·WIM 은 기기 언어로 router.replace 한다)으로 다시 마운트돼도 «열림»은 한 번만 센다.
let openCounted = false;

export function ShareLanding({ app, surface, locale, via, variant }: {
  app: App;
  surface: ShareSurface;
  locale: string;
  via?: string | null;
  variant: 'card' | 'bar';
}) {
  const l: Loc = locale === 'ko' || locale === 'ja' ? locale : 'en';
  useEffect(() => {
    if (openCounted) return;
    openCounted = true;
    shareBeacon('open', surface, via);
  }, [surface, via]);

  const c = COPY[app][l];
  const th = THEME[app];
  const href = `https://www.signumhq.com${APP_PATH[app]}?from=share&l=${l}`;
  const onClick = () => shareBeacon('click', surface, via);

  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ICON[app]} alt="" width={36} height={36} decoding="async"
        style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, display: 'block' }} />
      {/* width:0 + flex-basis 0 — 한 줄 말줄임(nowrap) 글이 «최소 폭»을 키워 페이지를 가로로 밀던 것을 막는다
          (2026-09-29 프리뷰 실측: 375px 에서 본문이 467px 로 넘쳤다. 부모가 flex 세로라 min-width:auto 가 글 길이를 따른다) */}
      <span style={{ minWidth: 0, width: 0, flex: '1 1 0%', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.72, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.kicker}</span>
        {/* 넘치면 말줄임 대신 두 줄로 접는다(좁은 360px 폰·넓은 안드로이드 글꼴 대비) — 대표 원칙 «글을 두 줄로» */}
        <span style={{ fontSize: 13.5, fontWeight: 800, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all' }}>{c.line}</span>
      </span>
      {/* 높이를 박는다 — globals.css 가 모바일 폭에서 모든 a 에 min-height:44px 를 준다(글자가 위로 쏠린다) */}
      <a href={href} rel="noopener" onClick={onClick} style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
        minHeight: 36, height: 36, background: th.btnBg, color: th.btnFg, textDecoration: 'none', borderRadius: 999,
        padding: '0 14px', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', lineHeight: 1,
      }}>{CTA[l]}</a>
    </>
  );

  const font = "-apple-system, 'SF Pro Text', 'Segoe UI', Pretendard, 'Apple SD Gothic Neo', 'Hiragino Sans', sans-serif";
  if (variant === 'bar') {
    return (
      <div data-share-landing={app} style={{
        position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
        background: th.bg, color: th.fg, fontFamily: font,
      }}>
        {body}
      </div>
    );
  }
  return (
    <aside data-share-landing={app} style={{
      display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 22px', padding: '12px 14px',
      borderRadius: 14, background: th.bg, color: th.fg, fontFamily: font,
    }}>
      {body}
    </aside>
  );
}

export default ShareLanding;
