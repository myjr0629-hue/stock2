const YahooFinance = require('yahoo-finance2').default;
// 에러 해결을 위해 인스턴스를 생성합니다.
const yahooFinance = new YahooFinance();

async function generateGemsInput() {
    try {
        console.log("--- GEMS V8.1 실시간 데이터 수집 시작 ---");

        // 분석할 핵심 종목
        const symbols = ['NVDA', 'TSLA', 'AVGO', 'MSTR', '^GSPC'];
        const results = await Promise.all(symbols.map(s => yahooFinance.quote(s)));

        // AI 주입용 데이터 팩 구성
        let prompt = `[COMMAND: DATA INJECTION & ALPHA REPORT]\n\n`;
        prompt += `커맨더, GEMS V8.1 제0원칙에 따라 검증된 실시간 데이터셋(S2)을 주입한다.\n`;
        prompt += `기준 시각: ${new Date().toLocaleString()} (KST)\n\n`;

        prompt += `1. 실시간 시세 (S2 - Price Core):\n`;
        results.forEach(res => {
            const price = res.regularMarketPrice ? res.regularMarketPrice.toFixed(2) : "N/A";
            const change = res.regularMarketChangePercent ? res.regularMarketChangePercent.toFixed(2) : "0.00";
            prompt += `- ${res.symbol}: $${price} (${change}%)\n`;
        });

        prompt += `\n2. 정책 및 촉매 (S1 - Policy Radar):\n`;
        prompt += `- [S1 데이터 대기 중: 최근 뉴스나 공시를 한 줄 입력하세요]\n\n`;

        prompt += `3. 운용 상태 (Baseline):\n`;
        prompt += `- 현재 보유 Top 3: NVDA, TSLA, MSTR\n\n`;

        prompt += `[TASK]\n`;
        prompt += `주입된 '진짜 숫자'를 바탕으로 GEMS V8.1 의무 출력 포맷 섹션 1~10을 생성하라.`;

        console.log("\n▼ 아래 내용을 복사해서 Antigravity 채팅창에 붙여넣으세요 ▼\n");
        console.log("--------------------------------------------------");
        console.log(prompt);
        console.log("--------------------------------------------------");

    } catch (e) {
        console.error("데이터 수집 에러:", e);
    }
}

generateGemsInput();