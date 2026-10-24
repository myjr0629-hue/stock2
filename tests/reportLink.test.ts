import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reportDate, reportPushPath, crossBriefUrl, matchesReportTarget } from '../src/lib/app/reportLink';

for (const locale of ['ko', 'en', 'ja']) {
    const target = reportPushPath('closing', locale, '2026-10-22')!;
    assert.equal(target, `/${locale}/app-view/intel?tab=report&date=2026-10-22`);
    assert.equal(reportPushPath('morning', locale), `/${locale}/app-view/guardian?tab=overview&brief=1`);
    assert.equal(reportPushPath('closing', locale, '2026-10-22', true), `/${locale}/intel?tab=report&date=2026-10-22`);
    assert.equal(matchesReportTarget(`/${locale}/app-view/intel`, '', target), false, '같은 페이지의 다른 탭');
    assert.equal(matchesReportTarget(`/${locale}/app-view/intel`, '?tab=report&date=2026-10-21', target), false, '같은 페이지의 다른 날짜');
    assert.equal(matchesReportTarget(`/${locale}/app-view/intel`, '?date=2026-10-22&tab=report', target), true, '실행 중 탭');
    assert.equal(matchesReportTarget('/en/app-view/dash', '', target), false, '차가운 실행 시작점');
}
for (const value of ['2026-02-30', '2026-1-22', '../settings', '2026-10-22&tab=sector', '', null]) assert.equal(reportDate(value), null);
assert.equal(reportDate('2028-02-29'), '2028-02-29');
assert.equal(reportPushPath('unknown', 'ko', '2026-10-22'), null);
assert.equal(reportPushPath('closing', 'ko', 'invalid'), '/ko/app-view/intel?tab=report', '옛 페이로드도 리포트 탭');
assert.equal(crossBriefUrl('2026-10-22'), '/api/intel/cross-sector-brief?date=2026-10-22');
assert.equal(crossBriefUrl(null), '/api/intel/cross-sector-brief');
assert.equal(matchesReportTarget('/ko/app-view/guardian', '?tab=overview', '/ko/app-view/guardian?tab=overview&brief=1'), false, '모닝 자동 열기 쿼리도 복구');
assert.equal(matchesReportTarget('/ko/app-view/flow', '?t=NVDA&from=alert', '/ko/app-view/flow?t=NVDA&from=alert'), true, '기존 종목 알림 경로 유지');
const route = fs.readFileSync('src/app/api/intel/cross-sector-brief/route.ts', 'utf8');
assert.ok(route.includes('requested ? [requested] : dates'));
assert.ok(route.indexOf('if (requested) return NextResponse.json') < route.indexOf("const healingKey"), '없는 날짜에서 현재 보고서를 새로 생성하지 않음');
const send = fs.readFileSync('src/lib/push/send.ts', 'utf8');
assert.ok(send.includes('data: dataFor(locale)'));
assert.equal((send.match(/copy, dataFor\(locale\)/g) || []).length, 2, 'APNs 기본·재시도 날짜 유지');
const app = fs.readFileSync('src/app/[locale]/app-view/intel/page.tsx', 'utf8');
assert.ok(app.includes('crossBriefUrl(requestedDate)'));
assert.ok(app.includes('[requestedTab, requestedDate]'));
assert.ok(app.includes('window.addEventListener(REPORT_OPEN_EVENT, open)') && app.includes('setExpandedReport(null)'), '같은 URL 재탭도 개별 섹터 시트를 닫고 리포트 탭으로');
const native = fs.readFileSync('src/components/native/NativeAppProvider.tsx', 'utf8');
assert.ok(native.includes('matchesReportTarget(window.location.pathname, window.location.search, target)'));
console.log('딥링크: ko/en/ja·차가운 실행·실행 중·동일 페이지·웹·날짜 결측/오염 검사 통과');
