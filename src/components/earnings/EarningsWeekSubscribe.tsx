import { StoreBadge } from '../common/StoreBadge';
import type { Loc } from '../../lib/earningsWeek';

const COPY: Record<Loc, { title: string; subscribe: string; ios: string; android: string }> = {
  ko: { title: '매주 월요일, 이번 주 실적 예상 변동폭을 메일로', subscribe: 'Substack 구독하기', ios: 'App Store에서 앱 받기', android: 'Google Play에서 앱 받기' },
  en: { title: "Get this week's earnings implied moves every Monday", subscribe: 'Subscribe on Substack', ios: 'Get the app on the App Store', android: 'Get the app on Google Play' },
  ja: { title: '毎週月曜、今週の決算想定変動幅をメールで', subscribe: 'Substackを購読', ios: 'App Storeでアプリを入手', android: 'Google Playでアプリを入手' },
};

export function EarningsWeekSubscribe({ locale }: { locale: Loc }) {
  const c = COPY[locale];
  return (
    <section className="ew-subscribe" aria-labelledby="ew-subscribe-title">
      <h2 id="ew-subscribe-title">{c.title}</h2>
      <div className="ew-subscribe-actions">
        <a className="ew-subscribe-link" href="https://signumhq.substack.com/">{c.subscribe}</a>
        <a href="https://apps.apple.com/app/id6783130444" aria-label={c.ios}><StoreBadge kind="ios" compact /></a>
        <a href="https://play.google.com/store/apps/details?id=com.signumhq.app" aria-label={c.android}><StoreBadge kind="android" compact /></a>
      </div>
    </section>
  );
}
