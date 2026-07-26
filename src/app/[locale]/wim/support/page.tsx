'use client';

// Why'd It Move? 지원 페이지 — App Store Connect의 "지원 URL"은 필수 항목이고
// 심사자가 실제로 열어보므로, 연락처 + 실제로 자주 나올 질문에 답하는 실물 페이지가
// 필요하다(빈 랜딩이나 약관 재탕은 리젝 사유가 된다). chrome-less: /wim* 는 레이아웃이
// 웹 헤더/푸터를 숨기므로 앱 안에서 열어도 웹처럼 보이지 않는다.

import { useParams, useRouter } from 'next/navigation';

type Loc = 'ko' | 'en' | 'ja';

const MAIL = 'contact@signumhq.com';

const T: Record<Loc, {
  back: string; title: string; lede: string;
  contactTitle: string; contactBody: string; write: string;
  faqTitle: string; faq: { q: string; a: string }[];
  legal: string; privacy: string; terms: string; company: string;
}> = {
  ko: {
    back: '뒤로',
    title: '고객 지원',
    lede: "Why'd It Move? 사용 중 궁금한 점이나 문제가 있으면 아래 내용을 확인하시고, 해결되지 않으면 언제든 이메일로 알려주세요.",
    contactTitle: '문의하기',
    contactBody: '평일 기준 보통 1~2일 안에 답변드립니다. 기기(예: iPhone 15) · iOS 버전 · 어떤 화면에서 생긴 문제인지 함께 적어주시면 훨씬 빠르게 확인할 수 있습니다.',
    write: '이메일 보내기',
    faqTitle: '자주 묻는 질문',
    faq: [
      { q: '알림을 끄고 싶어요.', a: '앱 오른쪽 위 설정(슬라이더 아이콘) → 알림 → 스위치를 끄면 됩니다. 끄는 즉시 저장된 기기 토큰이 삭제되어 더 이상 알림이 발송되지 않습니다. 기기 설정 › 알림에서 꺼도 됩니다.' },
      { q: '알림이 오지 않아요.', a: '① 앱 설정의 알림 스위치가 켜져 있는지 ② 기기 설정 › 알림에서 이 앱이 허용되어 있는지 ③ 집중 모드/방해금지가 켜져 있지 않은지 확인해 주세요. 알림은 미국 시장 마감 이후 하루 한 번만 발송됩니다.' },
      { q: '언어를 바꾸고 싶어요.', a: '설정 → 언어에서 English · 日本語 · 한국어 중 선택하면 즉시 전환됩니다.' },
      { q: '오늘은 문제가 없거나 적게 나와요.', a: '문제는 그날 실제로 크게 움직인 미국 종목으로 만듭니다. 미국 증시가 쉬는 날(주말·현지 공휴일)이나 큰 움직임이 없던 날은 문제 수가 줄거나 직전 거래일 데이터로 복습이 제공됩니다.' },
      { q: '데이터는 어디서 오나요?', a: '실제 시장 데이터와 공개된 뉴스를 사용합니다. 차트는 해당 종목의 실제 체결 데이터이며, 임의로 만든 예시가 아닙니다.' },
      { q: '학습 기록이 사라졌어요.', a: 'XP · 스트릭 · 학습 기록은 계정 없이 기기 안에만 저장됩니다. 앱을 삭제하거나 브라우저 데이터를 지우면 복구할 수 없습니다.' },
      { q: '투자 조언인가요?', a: '아닙니다. 이 앱은 시장에서 실제로 일어난 일을 설명하는 교육용 서비스이며, 매수·매도 권유나 투자 자문을 제공하지 않습니다.' },
    ],
    legal: '약관 및 정책',
    privacy: '개인정보 처리방침',
    terms: '이용약관',
    company: 'Signum Hq, LLC',
  },
  en: {
    back: 'Back',
    title: 'Support',
    lede: "Questions or problems with Why'd It Move? Check below first — if that doesn't solve it, email us any time.",
    contactTitle: 'Contact us',
    contactBody: 'We usually reply within 1–2 business days. Telling us your device (e.g. iPhone 15), iOS version, and which screen the problem happened on helps us fix it much faster.',
    write: 'Send an email',
    faqTitle: 'Frequently asked questions',
    faq: [
      { q: 'How do I turn notifications off?', a: 'Open Settings (the slider icon, top right) → Notifications → switch it off. Turning it off immediately deletes your stored device token, so nothing further is sent. You can also disable it in your device Settings › Notifications.' },
      { q: "I'm not getting notifications.", a: 'Check that (1) the switch in the app’s Settings is on, (2) notifications are allowed for this app in your device Settings › Notifications, and (3) Focus / Do Not Disturb is off. We send at most one notification a day, after the US market closes.' },
      { q: 'How do I change the language?', a: 'Settings → Language, then pick English, 日本語, or 한국어. It switches immediately.' },
      { q: 'Why are there no questions today, or fewer than usual?', a: "Questions are built from stocks that actually moved that day. When US markets are closed (weekends, US holidays) or nothing moved much, you'll see fewer questions or a review built from the last session." },
      { q: 'Where does the data come from?', a: 'Real market data and published news. Every chart is that stock’s actual trading session — never an invented example.' },
      { q: 'My progress disappeared.', a: 'XP, streaks, and learning history are stored only on your device — there is no account. Deleting the app or clearing its data removes them permanently.' },
      { q: 'Is this investment advice?', a: 'No. The app explains what already happened in the market for educational purposes. It never recommends buying or selling and does not provide investment advice.' },
    ],
    legal: 'Legal',
    privacy: 'Privacy Policy',
    terms: 'Terms of Use',
    company: 'Signum Hq, LLC',
  },
  ja: {
    back: '戻る',
    title: 'サポート',
    lede: "Why'd It Move? のご利用で分からないことや不具合があれば、まず以下をご確認ください。解決しない場合はいつでもメールでお知らせください。",
    contactTitle: 'お問い合わせ',
    contactBody: '通常1〜2営業日以内に返信いたします。端末（例：iPhone 15）・iOSバージョン・どの画面で起きたかを書いていただけると、確認がぐっと早くなります。',
    write: 'メールを送る',
    faqTitle: 'よくある質問',
    faq: [
      { q: '通知をオフにしたい。', a: '右上の設定（スライダーのアイコン）→ 通知 → スイッチをオフにしてください。オフにすると保存された端末トークンは即座に削除され、以後配信されません。端末の設定 › 通知からオフにすることもできます。' },
      { q: '通知が届きません。', a: '①アプリの設定で通知スイッチがオンか ②端末の設定 › 通知でこのアプリが許可されているか ③集中モード／おやすみモードがオンになっていないか、をご確認ください。配信は米国市場の終了後、1日1回のみです。' },
      { q: '言語を変更したい。', a: '設定 → 言語から English・日本語・한국어 を選ぶと、すぐに切り替わります。' },
      { q: '今日は問題が出ない／少ないのはなぜ？', a: '問題はその日に実際に大きく動いた米国株から作られます。米国市場が休みの日（週末・現地の祝日）や大きな値動きがなかった日は、問題数が減るか、直近の取引日のデータによる復習が表示されます。' },
      { q: 'データの出所は？', a: '実際の市場データと公開されたニュースを使用しています。チャートはその銘柄の実際の取引データであり、作り物の例ではありません。' },
      { q: '学習記録が消えました。', a: 'XP・ストリーク・学習履歴はアカウントを使わず端末内にのみ保存されます。アプリを削除したりデータを消去すると復元できません。' },
      { q: '投資助言ですか？', a: 'いいえ。本アプリは市場で実際に起きたことを解説する教育目的のサービスであり、売買の推奨や投資助言は行いません。' },
    ],
    legal: '規約とポリシー',
    privacy: 'プライバシーポリシー',
    terms: '利用規約',
    company: 'Signum Hq, LLC',
  },
};

const INK = '#241F42';
const SUB = '#6B6685';
const FAINT = '#8A85A0';
const LINE = '#E4E0F2';
const HERO = '#6E5DEC';

export default function WimSupportPage() {
  const params = useParams();
  const router = useRouter();
  const raw = (params as any)?.locale;
  const loc: Loc = raw === 'en' || raw === 'ja' ? raw : 'ko';
  const t = T[loc];

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5FF', color: INK, fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'calc(18px + env(safe-area-inset-top)) 18px calc(48px + env(safe-area-inset-bottom))' }}>
        <button
          type="button" onClick={() => router.push(`/${loc}/wim`)} aria-label={t.back}
          style={{ font: 'inherit', width: 38, height: 38, minWidth: 38, minHeight: 38, padding: 0, WebkitAppearance: 'none', appearance: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: `1.5px solid ${LINE}`, background: '#fff', fontSize: 16, fontWeight: 900, color: INK, cursor: 'pointer', flexShrink: 0 }}
        >←</button>

        <div style={{ marginTop: 18, fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: HERO }}>WHY&apos;D IT MOVE?</div>
        <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em' }}>{t.title}</h1>
        <p style={{ margin: '10px 0 0', fontSize: 14, fontWeight: 600, color: SUB, lineHeight: 1.65 }}>{t.lede}</p>

        {/* contact — the part a reviewer looks for */}
        <section style={{ marginTop: 22, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 20, padding: '18px 18px 20px', boxShadow: '0 10px 26px rgba(38,34,64,0.06)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>{t.contactTitle}</h2>
          <a href={`mailto:${MAIL}`} style={{ display: 'inline-block', marginTop: 10, fontSize: 17, fontWeight: 900, color: HERO, textDecoration: 'none', wordBreak: 'break-all' }}>{MAIL}</a>
          <p style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 600, color: SUB, lineHeight: 1.6 }}>{t.contactBody}</p>
          <a href={`mailto:${MAIL}`} style={{ display: 'block', marginTop: 14, textAlign: 'center', background: HERO, color: '#fff', borderRadius: 13, padding: '12px 0', fontSize: 14, fontWeight: 900, textDecoration: 'none' }}>{t.write}</a>
        </section>

        <h2 style={{ margin: '26px 0 0', fontSize: 16, fontWeight: 900 }}>{t.faqTitle}</h2>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {t.faq.map((f) => (
            <div key={f.q} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '14px 15px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 900, lineHeight: 1.45 }}>{f.q}</div>
              <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 600, color: SUB, lineHeight: 1.65 }}>{f.a}</div>
            </div>
          ))}
        </div>

        <h2 style={{ margin: '26px 0 0', fontSize: 16, fontWeight: 900 }}>{t.legal}</h2>
        <div style={{ marginTop: 10, display: 'flex', gap: 14, fontSize: 12.5, fontWeight: 800 }}>
          <a href={`/${loc}/wim/privacy`} style={{ color: HERO, textDecoration: 'none' }}>{t.privacy}</a>
          <span style={{ color: LINE }}>·</span>
          <a href={`/${loc}/wim/terms`} style={{ color: HERO, textDecoration: 'none' }}>{t.terms}</a>
        </div>

        <div style={{ marginTop: 28, fontSize: 11, fontWeight: 700, color: FAINT }}>© 2026 {t.company}</div>
      </div>
    </div>
  );
}
