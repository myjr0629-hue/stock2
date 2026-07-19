import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// WIM gets its own tab identity — without this the page inherits the site-wide
// "SIGNUM HQ" title, which mislabels shares/bookmarks and weakens SEO.
const META: Record<string, { title: string; desc: string }> = {
  ko: { title: "Why'd It Move? — 오늘 시장이 낸 문제", desc: '매일 밤, 실제 시장 데이터로 배우는 3분 수사. 차트·기관·거시·뉴스를 퀴즈로 익힙니다. 투자 조언이 아닌 교육 콘텐츠입니다.' },
  en: { title: "Why'd It Move? — Today's market, as a quiz", desc: 'A 3-minute nightly investigation built on real market data. Learn charts, institutional flow, macro, and news reading through play. Education, not investment advice.' },
  ja: { title: "Why'd It Move? — 今日の市場が出す問題", desc: '毎晩、実際の市場データで学ぶ3分の捜査。チャート・機関投資家・マクロ・ニュースの読み方をクイズで身につけます。投資助言ではなく教育コンテンツです。' },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const m = META[locale] || META.en;
  return { title: m.title, description: m.desc };
}

export default function WimLayout({ children }: { children: ReactNode }) {
  return children;
}
