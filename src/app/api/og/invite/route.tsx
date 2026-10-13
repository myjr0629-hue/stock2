// ============================================================================
// /api/og/invite — 친구 초대·선물 링크(/app?from=gift|share_*&code=…) 미리보기 카드 1200×675 (ko·ja·en) — 2026-10-14 (브랜치 feat/viral-loop)
//
// 왜: 선물 링크의 카드가 «iPhone · 선착순 500명 · 아이폰에서 탭 한 번 → 설치 + 적용 · 안드로이드는 앱 자체가 무료»(public/promo/redeem-card-*.png)였다.
//   그 카드는 아이폰 전용·채널 코드 공용이라, 카카오톡으로 선물을 받은 «안드로이드 친구»(한국은 안드가 다수)가 «내 것이 아니다»로 읽고 열지 않았다
//   (10/7~10/13 선물 링크 사람 열람 10건 전부 아이폰 — 안드로이드 0, 서버 안드 쿠폰 풀은 켜져 있었고 199장 그대로).
//   그래서 «누가 보낸 선물인가 + 아이폰·안드로이드 모두»를 먼저 말하는 전용 카드를 둔다. 안드로이드 쿠폰이 꺼져 있으면(a=0) «아이폰»만 말한다(사실대로).
// 규칙: «선착순»·남은 수·타이머 없음 · 가격 숫자 없음(스토어가 사용자 통화로 청구) · 자동 갱신 고지는 «무료» 문장 안에.
//   /api/og/invite?l=ko&a=1
// ============================================================================
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { loadCardFonts, loadIconDataUrl } from '@/lib/invite/ogFonts';

export const runtime = 'edge';

type L = 'ko' | 'en' | 'ja';
const C = { bg: '#06090f', title: '#F4F1E8', sub: '#B7C0D1', line: '#1C2434', foot: '#5A6376', gold: '#F7B733', goldSoft: '#FCD96A', ink: '#1C1405' };

const T: Record<L, { tag: string; big: string; sub: string; chips: [string, string]; both: string; ios: string; foot: string; kicker: string }> = {
  ko: { tag: '친구가 보낸 선물', big: 'PRO 1개월 무료', sub: '링크로 설치하면 첫 달 무료 — 이후 자동 갱신, 언제든 해지', chips: ['광고 없음', '내 종목 100개 (무료는 5개)'], both: '아이폰 · 안드로이드 모두', ios: '아이폰', foot: '신규·구독 만료 회원 대상 · 옵션 흐름·다크풀·맥스 페인', kicker: 'SIGNUM HQ' },
  en: { tag: 'A gift from a friend', big: 'PRO, 1 month free', sub: 'Install via this link for a free first month — then auto-renews, cancel anytime', chips: ['No ads', '100-ticker watchlist (free: 5)'], both: 'iPhone & Android', ios: 'iPhone', foot: 'New or lapsed subscribers · options flow, dark pool, max pain', kicker: 'SIGNUM HQ' },
  ja: { tag: '友だちからのプレゼント', big: 'PRO 1か月無料', sub: 'リンクから始めると最初の1か月無料 — 以降は自動更新、いつでも解約可', chips: ['広告なし', 'マイ銘柄100件(無料は5件)'], both: 'iPhone・Android どちらでも', ios: 'iPhone', foot: '新規・期限切れの方が対象 · オプションフロー・ダークプール・マックスペイン', kicker: 'SIGNUM HQ' },
};

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lang: L = sp.get('l') === 'ko' || sp.get('l') === 'ja' ? (sp.get('l') as L) : 'en';
  const android = sp.get('a') !== '0';
  const t = T[lang];
  const plat = android ? t.both : t.ios;
  const origin = request.nextUrl.origin;

  const glyphs = [t.tag, t.big, t.sub, ...t.chips, plat, t.foot, t.kicker, 'SIGNUM HQ PRO FREE 1 MONTH'].join('');
  let { fonts, cjk } = await loadCardFonts(lang, glyphs);
  let tt = t;
  let platTxt = plat;
  if (lang !== 'en' && !cjk) { tt = T.en; platTxt = android ? T.en.both : T.en.ios; ({ fonts } = await loadCardFonts('en', '')); }   // 한·일 글꼴을 못 받으면 영어판 — 카드는 항상 나온다
  const icon = await loadIconDataUrl(`${origin}/app-icons/signum-72.png`);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: C.bg, padding: '56px 72px 48px', fontFamily: 'Card', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: C.gold, display: 'flex' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {icon ? <img src={icon} width={64} height={64} style={{ borderRadius: 16 }} alt="" /> : <div style={{ width: 64, height: 64, borderRadius: 16, background: C.gold, display: 'flex' }} />}
          <div style={{ fontSize: 28, fontWeight: 700, color: C.title, letterSpacing: '0.12em', display: 'flex' }}>{tt.kicker}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 760 }}>
            <div style={{ display: 'flex', alignSelf: 'flex-start', padding: '6px 18px', borderRadius: 999, background: C.gold, color: C.ink, fontSize: 26, fontWeight: 700 }}>{tt.tag}</div>
            <div style={{ display: 'flex', fontSize: 96, lineHeight: 1.1, fontWeight: 700, color: C.title, marginTop: 20, letterSpacing: '-1px' }}>{tt.big}</div>
            <div style={{ display: 'flex', fontSize: 27, lineHeight: 1.4, color: C.sub, marginTop: 16 }}>{tt.sub}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 250, height: 250, borderRadius: 36, background: `linear-gradient(160deg, ${C.goldSoft}, ${C.gold})`, color: C.ink, boxShadow: '0 20px 60px -20px rgba(251,191,36,.55)' }}>
            <div style={{ display: 'flex', fontSize: 92, fontWeight: 700, lineHeight: 1 }}>PRO</div>
            <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, marginTop: 10 }}>1 MONTH</div>
            <div style={{ display: 'flex', fontSize: 30, fontWeight: 700 }}>FREE</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 14 }}>
            {tt.chips.map((c) => (
              <div key={c} style={{ display: 'flex', padding: '10px 20px', borderRadius: 14, border: `1.5px solid ${C.line}`, color: C.title, fontSize: 24, fontWeight: 700, background: '#0e1624' }}>{c}</div>
            ))}
            <div style={{ display: 'flex', padding: '10px 20px', borderRadius: 14, border: `1.5px solid ${C.gold}`, color: C.goldSoft, fontSize: 24, fontWeight: 700 }}>{platTxt}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderTop: `1px solid ${C.line}`, paddingTop: 20 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: C.gold, display: 'flex' }} />
            <div style={{ display: 'flex', fontSize: 21, color: C.foot }}>{tt.foot}</div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 675,
      fonts: fonts.length ? fonts : undefined,
      // 카드는 문구가 바뀌기 전엔 동일 — 스크래퍼가 자주 긁으므로 하루는 CDN 에 둔다(이건 «이미지»라 사람·봇 분기와 무관)
      headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400' },
    },
  );
}
