import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { publicBase } from '@/lib/net/publicBase';

// 기관 레이더 — 4th spinoff prototype. Own tab identity (SEO + share cards).
const META: Record<string, { title: string; desc: string }> = {
  ko: { title: '기관 레이더 — 시장 온도와 딜러 레벨, 3초 체크', desc: '고래·다크풀·옵션 구조로 잰 오늘의 시장 온도, 그리고 내 종목이 기관 레벨(콜월·맥스페인·감마플립)에 얼마나 가까운지 — 3초 확인 습관. 교육용 정보이며 투자 조언이 아닙니다.' },
  en: { title: 'Level Radar — market temperature & dealer levels in 3 seconds', desc: "Today's market temperature from whale/dark-pool/options structure, plus how close your tickers sit to dealer levels (call wall, max pain, gamma flip). Education only — not investment advice." },
  ja: { title: 'レベルレーダー — 市場温度とディーラーレベルを3秒で', desc: 'クジラ・ダークプール・オプション構造で測る今日の市場温度と、保有銘柄が機関レベル（コールウォール・マックスペイン）にどれだけ近いか。教育目的であり投資助言ではありません。' },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const m = META[locale] || META.en;
  const base = publicBase();
  // canonical/hreflang 이 «아예 없었다»(2026-08-22 seo-audit 실측).
  // 세 로케일이 서로 구별되는 신호가 없으면 구글이 중복으로 버린다 —
  // /ko/flow 150건이 정확히 그렇게 색인에서 빠졌다.
  return {
    title: m.title, description: m.desc,
    alternates: {
      canonical: `${base}/${locale}/radar`,
      languages: {
        en: `${base}/en/radar`, ko: `${base}/ko/radar`, ja: `${base}/ja/radar`,
        'x-default': `${base}/en/radar`,
      },
    },
    openGraph: { title: m.title, description: m.desc, url: `${base}/${locale}/radar`, type: 'website', images: [`${base}/og-brand.png`] },
    twitter: { card: 'summary_large_image', title: m.title, description: m.desc, images: [`${base}/og-brand.png`] },
  };
}

export default function RadarLayout({ children }: { children: ReactNode }) {
  return children;
}
