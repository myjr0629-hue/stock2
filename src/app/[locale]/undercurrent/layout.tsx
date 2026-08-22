import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// UC 는 page.tsx 가 'use client' 라 메타데이터를 export 할 수 없다 → 레이아웃에서 준다.
//
// ★ 스마트앱배너(itunes.appId)가 여기 있는 이유 (2026-08-18 실측):
//   루트 layout.tsx 가 전 페이지에 SIGNUM(6783130444)을 박고 있어서,
//   /ko/undercurrent 를 아이폰 사파리로 연 사람에게 «엉뚱한 앱»을 권하고 있었다.
//   Next 는 하위 세그먼트의 metadata 로 덮어쓰므로 이 파일 하나면 UC 경로가 낫는다.
const META: Record<string, { title: string; desc: string }> = {
  ko: {
    title: 'Undercurrent — 뉴스 뒤의 돈',
    desc: '헤드라인이 아니라 돈의 흐름으로 읽는 미국 증시. 매일 갱신되는 실데이터 브리핑. 투자 조언이 아닌 정보 제공입니다.',
  },
  en: {
    title: 'Undercurrent — the money behind the news',
    desc: 'Read the US market by where the money actually moved, not by headlines. Real data, refreshed every session. Information, not investment advice.',
  },
  ja: {
    title: 'Undercurrent — ニュースの裏のお金',
    desc: '見出しではなく資金の流れで読む米国株。毎営業日更新の実データブリーフィング。投資助言ではなく情報提供です。',
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const m = META[locale] || META.en;
  return { title: m.title, description: m.desc, itunes: { appId: '6788779895' } };
}

export default function UndercurrentLayout({ children }: { children: ReactNode }) {
  return children;
}
