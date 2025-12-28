// [S-56.2] Universe Policy SSOT 검증 스크립트
import fs from 'fs';
import path from 'path';

const PRODUCTION_URL = 'https://stock2-red.vercel.app';
const LOCAL_URL = 'http://localhost:3000';

interface VerificationResult {
    check: string;
    passed: boolean;
    details: string;
}

async function fetchJSON(url: string): Promise<any> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
}

async function verifyReport(source: 'local' | 'production'): Promise<VerificationResult[]> {
    const baseUrl = source === 'local' ? LOCAL_URL : PRODUCTION_URL;
    const results: VerificationResult[] = [];

    console.log(`\n=== ${source.toUpperCase()} 검증 시작 ===`);

    try {
        // 1. Health API 확인
        const health = await fetchJSON(`${baseUrl}/api/health/report?type=eod`);

        // Check universeStats
        const universeStats = health.universeStats;
        results.push({
            check: 'universeStats 존재',
            passed: universeStats !== null,
            details: universeStats ? `total=${universeStats.universeTotal}, stocks=${universeStats.universeStocks}` : 'null'
        });

        // Check macroSSOT
        const macroSSOT = health.macroSSOT;
        results.push({
            check: 'macroSSOT.ticker = NQ=F',
            passed: macroSSOT?.ticker === 'NQ=F',
            details: macroSSOT ? `ticker=${macroSSOT.ticker}, source=${macroSSOT.source}` : 'null'
        });

        // Check leadersTrack
        const leadersTrackStats = health.leadersTrackStats;
        results.push({
            check: 'leadersTrack 그룹 존재',
            passed: leadersTrackStats?.groupCount >= 3,
            details: leadersTrackStats ? `groups=${leadersTrackStats.groupCount}` : 'null'
        });

        // Check ETF Integrity
        const etfIntegrity = health.etfIntegrity;
        results.push({
            check: 'items에 ETF 없음',
            passed: etfIntegrity?.valid === true,
            details: etfIntegrity ? (etfIntegrity.valid ? '정상' : `실패: ${etfIntegrity.failedSymbols?.join(', ')}`) : 'null'
        });

        // 2. Latest Report 확인
        const report = await fetchJSON(`${baseUrl}/api/reports/latest?type=eod`);

        // Check items don't contain ETFs
        const etfSymbols = ['TQQQ', 'SQQQ', 'SPY', 'QQQ', 'GLD', 'SLV', 'AGQ', 'SIVR', 'EWZ', 'FXI'];
        const itemSymbols = (report.items || []).map((t: any) => t.symbol || t.ticker);
        const foundETFs = itemSymbols.filter((s: string) => etfSymbols.includes(s));

        results.push({
            check: 'items에 알려진 ETF 없음',
            passed: foundETFs.length === 0,
            details: foundETFs.length > 0 ? `발견: ${foundETFs.join(', ')}` : '정상'
        });

        // Check report.engine exists
        const engine = report.engine;
        results.push({
            check: 'report.engine 존재',
            passed: engine !== undefined,
            details: engine ? `keys=${Object.keys(engine).join(', ')}` : 'undefined'
        });

    } catch (error) {
        results.push({
            check: `${source} 연결`,
            passed: false,
            details: (error as Error).message
        });
    }

    return results;
}

async function main() {
    console.log('[S-56.2] Universe Policy SSOT 검증');
    console.log('='.repeat(50));

    // 로컬 검증
    let localResults: VerificationResult[] = [];
    try {
        localResults = await verifyReport('local');
    } catch (e) {
        console.log('[LOCAL] 연결 실패 - 스킵');
    }

    // Production 검증
    let prodResults: VerificationResult[] = [];
    try {
        prodResults = await verifyReport('production');
    } catch (e) {
        console.log('[PRODUCTION] 연결 실패 - 스킵');
    }

    // 결과 출력
    console.log('\n=== 검증 결과 요약 ===');

    if (localResults.length > 0) {
        console.log('\n[LOCAL]');
        localResults.forEach(r => {
            const icon = r.passed ? '✅' : '❌';
            console.log(`  ${icon} ${r.check}: ${r.details}`);
        });
        const localPassRate = (localResults.filter(r => r.passed).length / localResults.length * 100).toFixed(0);
        console.log(`  → 통과율: ${localPassRate}%`);
    }

    if (prodResults.length > 0) {
        console.log('\n[PRODUCTION]');
        prodResults.forEach(r => {
            const icon = r.passed ? '✅' : '❌';
            console.log(`  ${icon} ${r.check}: ${r.details}`);
        });
        const prodPassRate = (prodResults.filter(r => r.passed).length / prodResults.length * 100).toFixed(0);
        console.log(`  → 통과율: ${prodPassRate}%`);
    }

    // 최종 결과
    const allResults = [...localResults, ...prodResults];
    const allPassed = allResults.every(r => r.passed);

    console.log('\n' + '='.repeat(50));
    if (allPassed) {
        console.log('🎉 S-56.2 검증 완료: 모든 테스트 통과!');
    } else {
        console.log('⚠️ S-56.2 검증 완료: 일부 테스트 실패');
        process.exit(1);
    }
}

main();
