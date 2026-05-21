import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // 로컬 환경변수 주입

// tsconfig-paths 지원을 위해 수동 상대경로 import
import { fetchMarketSnapshot } from '../src/lib/marketing-v2/core/data';

async function test() {
    console.log("=========================================");
    console.log("🔍 Live Fetch Test for SPY/QQQ/DIA via Polygon SSoT");
    console.log("=========================================");
    
    try {
        const snapshot = await fetchMarketSnapshot();
        console.log("✅ SUCCESS! Retrieved Market Snapshot:");
        console.log(`- SPY Change % : ${snapshot.spy.toFixed(2)}%`);
        console.log(`- QQQ Change % : ${snapshot.qqq.toFixed(2)}%`);
        console.log(`- DIA Change % : ${snapshot.dia.toFixed(2)}%`);
        console.log(`- SPY Price    : $${snapshot.spyPrice.toFixed(2)}`);
        console.log(`- VIX Level    : ${snapshot.vix}`);
        console.log(`- GEX Regime   : ${snapshot.gexRegime}`);
    } catch (e: any) {
        console.error("❌ FAIL to fetch market snapshot:", e);
    }
    console.log("=========================================");
}

test();
