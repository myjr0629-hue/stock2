// UnifiedPriceService — 엣지 케이스 테스트
import {
    calcUnifiedPrice, getFullPriceDisplay, getWatchlistPrice, getSessionChange,
    MarketSession,
} from '../src/services/unifiedPriceService';

let total = 0, pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail: string) {
    total++;
    if (cond) { pass++; }
    else { failures.push(name + ': ' + detail); console.log('  ❌ ' + name + ': ' + detail); }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  UnifiedPriceService 엣지 케이스 테스트');
console.log('═══════════════════════════════════════════════════════════');
console.log();

// ═══ 1. 주말/휴일 ═══
console.log('━━━ 1. 주말/휴일 (CLOSED, 최소 데이터) ━━━');
const weekend = getFullPriceDisplay({ session: 'CLOSED', lastTradePrice: 0, dayClose: 0, prevDayClose: 150.00, dailyCloses: [150, 148] });
check('주말 regularPrice', weekend.regularPrice === 150, '$'+weekend.regularPrice);
check('주말 changePct', Math.abs(weekend.regularChangePct - 1.35) < 0.02, weekend.regularChangePct+'%');
check('주말 activePrice', weekend.activePrice === 150, '$'+weekend.activePrice);
console.log(`  ✅ reg=$${weekend.regularPrice} ${weekend.regularChangePct}% active=$${weekend.activePrice}`);
console.log();

// ═══ 2. 신규 IPO (prevDayClose=0) ═══
console.log('━━━ 2. 신규 IPO (prevDayClose=0) ━━━');
const ipo = getFullPriceDisplay({ session: 'REG', lastTradePrice: 25.50, dayClose: 25.00, prevDayClose: 0 });
check('IPO price>0', ipo.regularPrice === 25.50, '$'+ipo.regularPrice);
check('IPO changePct=0', ipo.regularChangePct === 0, ipo.regularChangePct+'%');
console.log(`  ✅ reg=$${ipo.regularPrice} ${ipo.regularChangePct}%`);
console.log();

// ═══ 3. 모든 값 0 (크래시 방지) ═══
console.log('━━━ 3. 모든 값 0 (최악) ━━━');
const worst = getFullPriceDisplay({ session: 'CLOSED', lastTradePrice: 0, dayClose: 0, prevDayClose: 0 });
check('최악 크래시없음', worst !== null, 'not null');
check('최악 price=0', worst.regularPrice === 0, '$'+worst.regularPrice);
check('최악 changePct=0', worst.regularChangePct === 0, worst.regularChangePct+'%');
console.log(`  ✅ no crash, reg=$${worst.regularPrice} ${worst.regularChangePct}%`);
console.log();

// ═══ 4. REG + preMarket=undefined ═══
console.log('━━━ 4. REG + preMarket=undefined (현재 상황) ━━━');
const noPreMkt = getFullPriceDisplay({ session: 'REG', lastTradePrice: 200, dayClose: 199.5, prevDayClose: 195, preMarketPrice: null });
check('REG noPreMkt price', noPreMkt.regularPrice === 200, '$'+noPreMkt.regularPrice);
check('REG noPreMkt noExt', noPreMkt.prePrice === null, 'prePrice='+noPreMkt.prePrice);
console.log(`  ✅ reg=$${noPreMkt.regularPrice} ${noPreMkt.regularChangePct}% prePrice=${noPreMkt.prePrice}`);
console.log();

// ═══ 5. REG + preMarket 있음 (PRE CLOSE 배지) ═══
console.log('━━━ 5. REG + preMarket=197.50 (PRE CLOSE) ━━━');
const withPre = getFullPriceDisplay({ session: 'REG', lastTradePrice: 200, dayClose: 199.5, prevDayClose: 195, preMarketPrice: 197.50 });
check('REG+PRE prePrice', withPre.prePrice === 197.50, '$'+withPre.prePrice);
check('REG+PRE preChg', Math.abs((withPre.preChangePct||0) - 1.28) < 0.02, withPre.preChangePct+'%');
check('REG+PRE mainUnchanged', withPre.regularPrice === 200, '$'+withPre.regularPrice);
console.log(`  ✅ reg=$${withPre.regularPrice} prePrice=$${withPre.prePrice} preChg=${withPre.preChangePct}%`);
console.log();

// ═══ 6. POST + WebSocket ═══
console.log('━━━ 6. POST + WebSocket ━━━');
const postWs = getFullPriceDisplay({ session: 'POST', lastTradePrice: 200, dayClose: 198, prevDayClose: 195, regularCloseToday: 198, wsPrice: 201.50, afterHoursPrice: 200 });
check('POST+WS postPrice=WS', postWs.postPrice === 201.50, '$'+postWs.postPrice);
check('POST+WS regPrice=regClose', postWs.regularPrice === 198, '$'+postWs.regularPrice);
check('POST+WS postChg', Math.abs((postWs.postChangePct||0) - 1.77) < 0.02, postWs.postChangePct+'%');
console.log(`  ✅ reg=$${postWs.regularPrice} post=$${postWs.postPrice} postChg=${postWs.postChangePct}%`);
console.log();

// ═══ 7. PRE + day.c=0 + dailyCloses 없음 ═══
console.log('━━━ 7. PRE + day.c=0 + dailyCloses 없음 ━━━');
const preNoDC = getFullPriceDisplay({ session: 'PRE', lastTradePrice: 152, dayClose: 0, prevDayClose: 150 });
check('PRE noDC regPrice', preNoDC.regularPrice === 150, '$'+preNoDC.regularPrice);
check('PRE noDC regChg=0', preNoDC.regularChangePct === 0, preNoDC.regularChangePct+'%');
check('PRE noDC prePrice', preNoDC.prePrice === 152, '$'+preNoDC.prePrice);
check('PRE noDC preChg', Math.abs((preNoDC.preChangePct||0) - 1.33) < 0.02, preNoDC.preChangePct+'%');
console.log(`  ✅ reg=$${preNoDC.regularPrice} ${preNoDC.regularChangePct}% pre=$${preNoDC.prePrice} preChg=${preNoDC.preChangePct}%`);
console.log();

// ═══ 8. PRE + dailyCloses로 본장% 계산 ═══
console.log('━━━ 8. PRE + day.c=0 + dailyCloses=[150,145] ━━━');
const preWithDC = getFullPriceDisplay({ session: 'PRE', lastTradePrice: 152, dayClose: 0, prevDayClose: 150, dailyCloses: [150, 145] });
check('PRE+DC regPrice', preWithDC.regularPrice === 150, '$'+preWithDC.regularPrice);
check('PRE+DC regChg', Math.abs(preWithDC.regularChangePct - 3.45) < 0.02, preWithDC.regularChangePct+'%');
check('PRE+DC prePrice', preWithDC.prePrice === 152, '$'+preWithDC.prePrice);
console.log(`  ✅ reg=$${preWithDC.regularPrice} ${preWithDC.regularChangePct}% pre=$${preWithDC.prePrice}`);
console.log();

// ═══ 9. Watchlist 전 세션 ═══
console.log('━━━ 9. Watchlist Mode 전 세션 ━━━');
(['PRE','REG','POST','CLOSED'] as MarketSession[]).forEach(s => {
    const wl = getWatchlistPrice({
        session: s, lastTradePrice: 200, dayClose: s === 'PRE' ? 0 : 198, prevDayClose: 195,
        regularCloseToday: s === 'POST' || s === 'CLOSED' ? 198 : null,
        afterHoursPrice: s === 'POST' || s === 'CLOSED' ? 199 : null,
        preMarketPrice: s === 'PRE' ? 200 : 197,
        dailyCloses: [195, 190],
    });
    check('WL['+s+'] price>0', wl.displayPrice > 0, '$'+wl.displayPrice);
    check('WL['+s+'] changePct', typeof wl.changePct === 'number', wl.changePct+'%');
    const extOk = (s === 'REG' || s === 'CLOSED') ? true : (wl.extLabel !== null);
    check('WL['+s+'] ext', extOk, 'ext='+wl.extLabel);
    console.log(`  ${s}: $${wl.displayPrice.toFixed(2)} ${wl.changePct.toFixed(2)}% ext=${wl.extLabel} extChg=${wl.extChangePct?.toFixed(2)||'-'}%`);
});
console.log();

// ═══ 10. Related 전 세션 ═══
console.log('━━━ 10. Related (Session Mode) 전 세션 ━━━');
(['PRE','REG','POST','CLOSED'] as MarketSession[]).forEach(s => {
    const sess = getSessionChange({
        session: s, lastTradePrice: 200, dayClose: s === 'PRE' ? 0 : 198, prevDayClose: 195,
        regularCloseToday: s === 'POST' || s === 'CLOSED' ? 198 : null,
        afterHoursPrice: s === 'POST' ? 199 : null,
    });
    check('Rel['+s+'] price>0', sess.price > 0, '$'+sess.price);
    check('Rel['+s+'] changePct', typeof sess.changePct === 'number', sess.changePct.toFixed(2)+'%');
    console.log(`  ${s}: $${sess.price.toFixed(2)} ${sess.changePct.toFixed(2)}%`);
});
console.log();

// ═══ 11. 소수점 정밀도 ═══
console.log('━━━ 11. 소수점 정밀도 ━━━');
const prec = getFullPriceDisplay({ session: 'REG', lastTradePrice: 123.456789, dayClose: 123.45, prevDayClose: 120.123456 });
check('소수점2자리', String(prec.regularChangePct).split('.')[1]?.length <= 2, prec.regularChangePct+'%');
console.log(`  ✅ changePct=${prec.regularChangePct}%`);
console.log();

// ═══ 12. 큰 가격 (BRK.A 급 $700K) ═══
console.log('━━━ 12. 초대형 가격 (BRK.A $700K) ━━━');
const brk = getFullPriceDisplay({ session: 'REG', lastTradePrice: 702000, dayClose: 700000, prevDayClose: 698000 });
check('BRK price', brk.regularPrice === 702000, '$'+brk.regularPrice);
check('BRK changePct', Math.abs(brk.regularChangePct - 0.57) < 0.02, brk.regularChangePct+'%');
console.log(`  ✅ reg=$${brk.regularPrice} ${brk.regularChangePct}%`);
console.log();

// ═══ 13. 페니 주식 ($0.05) ═══
console.log('━━━ 13. 페니 주식 ($0.05) ━━━');
const penny = getFullPriceDisplay({ session: 'REG', lastTradePrice: 0.05, dayClose: 0.04, prevDayClose: 0.03 });
check('penny price', penny.regularPrice === 0.05, '$'+penny.regularPrice);
check('penny changePct', Math.abs(penny.regularChangePct - 66.67) < 0.1, penny.regularChangePct+'%');
console.log(`  ✅ reg=$${penny.regularPrice} ${penny.regularChangePct}%`);
console.log();

console.log('═══════════════════════════════════════════════════════════');
console.log(`  엣지 케이스: ${pass}/${total} ${pass === total ? '✅ ALL PASS' : '❌ FAILURES'}`);
if (failures.length > 0) failures.forEach(f => console.log('  • ' + f));
console.log('═══════════════════════════════════════════════════════════');
