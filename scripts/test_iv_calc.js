// Black-Scholes IV Calculator — Standalone Test
// Tests:
//   1. Standard Normal CDF
//   2. BS call/put pricing
//   3. Newton-Raphson IV solver
//   4. Known answer verification

// ═══════════ Standard Normal CDF (Abramowitz & Stegun approximation) ═══════════
function normcdf(x) {
    if (x > 6) return 1;
    if (x < -6) return 0;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.2316419 * x);
    const d = 0.3989422804014327; // 1/sqrt(2π)
    const pdf = d * Math.exp(-0.5 * x * x);
    const p = pdf * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return sign === 1 ? 1 - p : p;
}

// ═══════════ Black-Scholes Price ═══════════
function bsPrice(S, K, T, r, sigma, optionType) {
    if (T <= 0 || sigma <= 0) return 0;
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    
    if (optionType === "C") {
        return S * normcdf(d1) - K * Math.exp(-r * T) * normcdf(d2);
    } else {
        return K * Math.exp(-r * T) * normcdf(-d2) - S * normcdf(-d1);
    }
}

// ═══════════ Vega (sensitivity to volatility) ═══════════
function bsVega(S, K, T, r, sigma) {
    if (T <= 0 || sigma <= 0) return 0;
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const pdf = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);
    return S * Math.sqrt(T) * pdf;
}

// ═══════════ Newton-Raphson IV Solver ═══════════
function calcIV(marketPrice, S, K, T, r, optionType) {
    // Validate inputs
    if (marketPrice <= 0 || S <= 0 || K <= 0 || T <= 0) return null;
    
    // Initial guess: Brenner-Subrahmanyam approximation
    let sigma = Math.sqrt(2 * Math.PI / T) * (marketPrice / S);
    sigma = Math.max(0.01, Math.min(sigma, 5.0)); // Clamp [1%, 500%]
    
    const MAX_ITER = 50;
    const TOLERANCE = 1e-6;
    
    for (let i = 0; i < MAX_ITER; i++) {
        const price = bsPrice(S, K, T, r, sigma, optionType);
        const vega = bsVega(S, K, T, r, sigma);
        
        if (vega < 1e-10) break; // Vega too small → can't converge
        
        const diff = price - marketPrice;
        if (Math.abs(diff) < TOLERANCE) break; // Converged
        
        sigma = sigma - diff / vega;
        sigma = Math.max(0.001, Math.min(sigma, 10.0)); // Clamp safety
    }
    
    // Sanity check
    if (sigma < 0.001 || sigma > 10.0) return null;
    return Math.round(sigma * 10000) / 10000; // 4 decimal places
}

// ═══════════ TESTS ═══════════
console.log("=== Black-Scholes IV Calculator Tests ===\n");

// Test 1: normcdf
console.log("1. normcdf tests:");
console.log(`   N(0)    = ${normcdf(0).toFixed(6)} (expected: 0.500000)`);
console.log(`   N(1)    = ${normcdf(1).toFixed(6)} (expected: 0.841345)`);
console.log(`   N(-1)   = ${normcdf(-1).toFixed(6)} (expected: 0.158655)`);
console.log(`   N(2)    = ${normcdf(2).toFixed(6)} (expected: 0.977250)`);
const cdfOk = Math.abs(normcdf(0) - 0.5) < 0.001 
           && Math.abs(normcdf(1) - 0.8413) < 0.001
           && Math.abs(normcdf(-1) - 0.1587) < 0.001;
console.log(`   Result: ${cdfOk ? "✅ PASS" : "❌ FAIL"}\n`);

// Test 2: BS pricing (known values)
// S=100, K=100, T=1yr, r=5%, σ=20% → Call ≈ $10.45
console.log("2. BS Call pricing:");
const callPrice = bsPrice(100, 100, 1, 0.05, 0.20, "C");
console.log(`   BS(S=100, K=100, T=1, r=5%, σ=20%, Call) = $${callPrice.toFixed(2)}`);
console.log(`   Expected: ~$10.45`);
const callOk = Math.abs(callPrice - 10.45) < 0.5;
console.log(`   Result: ${callOk ? "✅ PASS" : "❌ FAIL"}\n`);

// Test 3: IV solver — recover known σ
console.log("3. IV solver (recover known σ=20%):");
const recoveredIV = calcIV(callPrice, 100, 100, 1, 0.05, "C");
console.log(`   Input market price: $${callPrice.toFixed(2)}`);
console.log(`   Recovered IV: ${recoveredIV ? (recoveredIV * 100).toFixed(2) + "%" : "null"}`);
console.log(`   Expected: 20.00%`);
const ivOk = recoveredIV && Math.abs(recoveredIV - 0.20) < 0.001;
console.log(`   Result: ${ivOk ? "✅ PASS" : "❌ FAIL"}\n`);

// Test 4: Real-world-like example — NVDA ATM call
// NVDA stock ~$180, ATM call strike $180, 30 days to expiry, ~50% IV
console.log("4. Real-world NVDA example:");
const nvdaCallPrice = bsPrice(180, 180, 30/365, 0.05, 0.50, "C");
console.log(`   BS(S=180, K=180, T=30d, r=5%, σ=50%, Call) = $${nvdaCallPrice.toFixed(2)}`);
const nvdaIV = calcIV(nvdaCallPrice, 180, 180, 30/365, 0.05, "C");
console.log(`   Recovered IV: ${nvdaIV ? (nvdaIV * 100).toFixed(2) + "%" : "null"}`);
const nvdaOk = nvdaIV && Math.abs(nvdaIV - 0.50) < 0.01;
console.log(`   Result: ${nvdaOk ? "✅ PASS" : "❌ FAIL"}\n`);

// Test 5: Put option
console.log("5. Put option IV:");
const putPrice = bsPrice(100, 105, 0.5, 0.05, 0.25, "P");
console.log(`   BS(S=100, K=105, T=0.5y, r=5%, σ=25%, Put) = $${putPrice.toFixed(2)}`);
const putIV = calcIV(putPrice, 100, 105, 0.5, 0.05, "P");
console.log(`   Recovered IV: ${putIV ? (putIV * 100).toFixed(2) + "%" : "null"}`);
const putOk = putIV && Math.abs(putIV - 0.25) < 0.01;
console.log(`   Result: ${putOk ? "✅ PASS" : "❌ FAIL"}\n`);

// Test 6: Edge cases
console.log("6. Edge cases:");
const deepOTM = calcIV(0.05, 100, 150, 0.1, 0.05, "C");
console.log(`   Deep OTM call (S=100, K=150, price=$0.05): IV=${deepOTM ? (deepOTM * 100).toFixed(2) + "%" : "null"}`);
const nearExpiry = calcIV(2.0, 180, 180, 1/365, 0.05, "C");
console.log(`   Near expiry (1 day, ATM, $2.00): IV=${nearExpiry ? (nearExpiry * 100).toFixed(2) + "%" : "null"}`);
const zeroPrice = calcIV(0, 100, 100, 1, 0.05, "C");
console.log(`   Zero price: IV=${zeroPrice || "null (expected)"}`);

// Summary
const allPassed = cdfOk && callOk && ivOk && nvdaOk && putOk;
console.log(`\n=== ${allPassed ? "✅ ALL TESTS PASSED" : "❌ SOME TESTS FAILED"} ===`);
