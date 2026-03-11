/**
 * ══════════════════════════════════════════════════════════════
 * SIGNUM HQ — EC2 Guardian History Writer (DynamoDB)
 * ══════════════════════════════════════════════════════════════
 * 
 * Called by the Guardian Worker every 5 minutes during REG session.
 * Writes RLSI/GEX/Breadth snapshots to DynamoDB for 90-day history.
 * 
 * DynamoDB Table: guardian-history
 *   Partition Key: date (YYYY-MM-DD)
 *   Sort Key:      time (HH:mm)
 *   TTL:           expireAt (90 days)
 */

const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE_NAME = process.env.GUARDIAN_HISTORY_TABLE || "guardian-history";
const TTL_DAYS = 90;

// DynamoDB client
const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: { removeUndefinedValues: true },
});

// ══════════════════════════════════════════════════════════════
// TABLE CREATION (one-time)
// ══════════════════════════════════════════════════════════════

async function ensureTable() {
    try {
        await dynamoClient.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
        console.log(`[DynamoDB] Table '${TABLE_NAME}' exists`);
    } catch (e) {
        if (e.name === "ResourceNotFoundException") {
            console.log(`[DynamoDB] Creating table '${TABLE_NAME}'...`);
            await dynamoClient.send(new CreateTableCommand({
                TableName: TABLE_NAME,
                KeySchema: [
                    { AttributeName: "date", KeyType: "HASH" },  // Partition key
                    { AttributeName: "time", KeyType: "RANGE" },  // Sort key
                ],
                AttributeDefinitions: [
                    { AttributeName: "date", AttributeType: "S" },
                    { AttributeName: "time", AttributeType: "S" },
                ],
                BillingMode: "PAY_PER_REQUEST",  // On-demand (no provisioned capacity)
            }));
            console.log(`[DynamoDB] Table '${TABLE_NAME}' created (PAY_PER_REQUEST)`);
            // Enable TTL
            const { DynamoDBClient: DC, UpdateTimeToLiveCommand } = require("@aws-sdk/client-dynamodb");
            await dynamoClient.send(new UpdateTimeToLiveCommand({
                TableName: TABLE_NAME,
                TimeToLiveSpecification: {
                    Enabled: true,
                    AttributeName: "expireAt",
                },
            }));
            console.log(`[DynamoDB] TTL enabled on 'expireAt'`);
        } else {
            throw e;
        }
    }
}

// ══════════════════════════════════════════════════════════════
// WRITE SNAPSHOT
// ══════════════════════════════════════════════════════════════

async function writeSnapshot(snapshot) {
    if (!snapshot?.rlsi) return;

    const now = new Date();
    const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
    const et = new Date(etStr);

    const date = et.toISOString().split("T")[0]; // YYYY-MM-DD in ET
    const hours = String(et.getHours()).padStart(2, "0");
    const minutes = String(et.getMinutes()).padStart(2, "0");
    const time = `${hours}:${minutes}`;
    const timestamp = now.getTime();

    // === 1) Guardian unified history (guardian-history table) ===
    const item = {
        date,
        time,
        // Core metrics
        rlsi: Math.round(snapshot.rlsi.score * 10) / 10,
        rlsiLevel: snapshot.rlsi.level,
        session: snapshot.rlsi.session,
        // Gamma Shield
        gexIndex: snapshot.gammaShield?.gexIndex || null,
        gexLevel: snapshot.gammaShield?.gexLevel || null,
        squeezeRisk: snapshot.gammaShield?.squeezeRisk || null,
        // Breadth
        breadthPct: snapshot.breadth?.breadthPct || null,
        adRatio: snapshot.breadth?.adRatio || null,
        // Market
        vix: snapshot.rlsi.components?.vix || null,
        nqChange: snapshot.market?.nqChangePercent || null,
        // Sector top 3 (compact)
        topSectors: (snapshot.sectors || [])
            .sort((a, b) => (b.change || 0) - (a.change || 0))
            .slice(0, 3)
            .map(s => ({ id: s.id, ch: Math.round((s.change || 0) * 100) / 100 })),
        // Regime
        regime: snapshot.tripleA?.regime || null,
        marketStatus: snapshot.marketStatus || null,
        // TTL (90 days from now)
        expireAt: Math.floor(now.getTime() / 1000) + TTL_DAYS * 24 * 60 * 60,
        // Metadata
        _ts: now.toISOString(),
    };

    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
    }));

    console.log(`[DynamoDB] Written: ${date} ${time} | RLSI: ${item.rlsi} | GEX: ${item.gexIndex} | VIX: ${item.vix}`);

    // === 2) RLSI History (signum-rlsi-history table — Vercel API reads this) ===
    try {
        const rlsiItem = {
            pk: "MARKET",
            timestamp,
            rlsi: Math.round(snapshot.rlsi.score * 10) / 10,
            momentum: snapshot.rlsi.components?.momentum || 0,
            participation: snapshot.rlsi.components?.participation || 0,
            priceTrend: snapshot.rlsi.components?.priceActionScore || 0,
            rotation: snapshot.rlsi.components?.rotation || 0,
            sentiment: snapshot.rlsi.components?.sentiment || 0,
            regime: snapshot.rlsi.level || "NEUTRAL",
        };
        await docClient.send(new PutCommand({
            TableName: "signum-rlsi-history",
            Item: rlsiItem,
        }));
        console.log(`[DynamoDB] signum-rlsi-history: RLSI ${rlsiItem.rlsi}`);
    } catch (e) {
        console.warn(`[DynamoDB] signum-rlsi-history write failed:`, e.message);
    }

    // === 3) GEX History (signum-gex-history table) ===
    if (snapshot.gammaShield?.gexIndex != null) {
        try {
            const gexItem = {
                ticker: "SPY",
                timestamp,
                gex: snapshot.gammaShield.gexIndex,
                flipLevel: snapshot.gammaShield.gammaFlipPoint || null,
                callWall: snapshot.gammaShield.resistanceWall || null,
                putFloor: snapshot.gammaShield.supportWall || null,
                maxPain: null,
                price: snapshot.gammaShield.currentPrice || 0,
                gammaRegime: snapshot.gammaShield.gexLevel || "NEUTRAL",
            };
            await docClient.send(new PutCommand({
                TableName: "signum-gex-history",
                Item: gexItem,
            }));
            console.log(`[DynamoDB] signum-gex-history: GEX ${gexItem.gex} | Price ${gexItem.price}`);
        } catch (e) {
            console.warn(`[DynamoDB] signum-gex-history write failed:`, e.message);
        }
    }
}

// ══════════════════════════════════════════════════════════════
// QUERY: Get day's history
// ══════════════════════════════════════════════════════════════

async function getDayHistory(date) {
    const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "#date = :date",
        ExpressionAttributeNames: { "#date": "date" },
        ExpressionAttributeValues: { ":date": date },
        ScanIndexForward: true, // Ascending by time
    }));
    return result.Items || [];
}

// ══════════════════════════════════════════════════════════════
// QUERY: Get multi-day heatmap (last N days)
// ══════════════════════════════════════════════════════════════

async function getHeatmapData(daysBack = 30) {
    const dates = [];
    const now = new Date();
    for (let i = 0; i < daysBack; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split("T")[0]);
    }

    // Parallel queries for all dates
    const results = await Promise.all(
        dates.map(date => getDayHistory(date))
    );

    // Flatten into heatmap format
    return dates.map((date, idx) => ({
        date,
        entries: results[idx],
        avgRlsi: results[idx].length > 0
            ? Math.round(results[idx].reduce((s, e) => s + (e.rlsi || 0), 0) / results[idx].length)
            : null,
        peak: results[idx].length > 0
            ? Math.max(...results[idx].map(e => e.rlsi || 0))
            : null,
        low: results[idx].length > 0
            ? Math.min(...results[idx].map(e => e.rlsi || 0))
            : null,
    }));
}

// ══════════════════════════════════════════════════════════════
// QUERY: Find similar conditions in history
// ══════════════════════════════════════════════════════════════

async function findSimilarConditions(currentRlsi, currentGex, tolerance = 10, daysBack = 30) {
    const heatmap = await getHeatmapData(daysBack);
    const matches = [];

    for (const day of heatmap) {
        for (const entry of day.entries) {
            if (!entry.rlsi || !entry.gexIndex) continue;
            const rlsiDiff = Math.abs(entry.rlsi - currentRlsi);
            const gexDiff = Math.abs((entry.gexIndex || 0) - currentGex);
            if (rlsiDiff <= tolerance && gexDiff <= tolerance * 2) {
                matches.push({
                    date: entry.date,
                    time: entry.time,
                    rlsi: entry.rlsi,
                    gexIndex: entry.gexIndex,
                    vix: entry.vix,
                    regime: entry.regime,
                    nqChange: entry.nqChange,
                });
            }
        }
    }

    return matches.slice(0, 10); // Top 10 matches
}

module.exports = {
    ensureTable,
    writeSnapshot,
    getDayHistory,
    getHeatmapData,
    findSimilarConditions,
    TABLE_NAME,
};
