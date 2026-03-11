/**
 * GET /api/guardian/history?date=YYYY-MM-DD&days=30&mode=heatmap|day|similar&rlsi=50&gex=10
 * 
 * Guardian Historical Data API
 * Reads RLSI/GEX/Breadth history from DynamoDB for visualization.
 * 
 * Modes:
 *   day:     Intraday data for a specific date
 *   heatmap: Multi-day summary (avg RLSI, peak, low) for N days
 *   similar: Find past conditions matching current RLSI+GEX
 */

import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.GUARDIAN_HISTORY_TABLE || 'guardian-history';

const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: { removeUndefinedValues: true },
});

// ── Query helpers ──

async function getDayHistory(date: string) {
    const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#date = :date',
        ExpressionAttributeNames: { '#date': 'date' },
        ExpressionAttributeValues: { ':date': date },
        ScanIndexForward: true,
    }));
    return result.Items || [];
}

async function getHeatmapData(daysBack: number = 30) {
    const dates: string[] = [];
    const now = new Date();
    for (let i = 0; i < daysBack; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }

    const results = await Promise.all(dates.map(date => getDayHistory(date)));

    return dates.map((date, idx) => {
        const entries = results[idx];
        if (entries.length === 0) return { date, avgRlsi: null, peak: null, low: null, count: 0 };
        const scores = entries.map((e: any) => e.rlsi || 0);
        return {
            date,
            avgRlsi: Math.round(scores.reduce((s: number, v: number) => s + v, 0) / scores.length),
            peak: Math.max(...scores),
            low: Math.min(...scores),
            count: entries.length,
        };
    });
}

async function findSimilarConditions(currentRlsi: number, currentGex: number, daysBack: number = 30) {
    const heatmap = await Promise.all(
        Array.from({ length: daysBack }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return getDayHistory(d.toISOString().split('T')[0]);
        })
    );

    const matches: any[] = [];
    const tolerance = 10;

    for (const dayEntries of heatmap) {
        for (const entry of dayEntries as any[]) {
            if (!entry.rlsi || entry.gexIndex === null) continue;
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

    return matches.slice(0, 10);
}

// ── Route handler ──

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'heatmap';

    try {
        if (mode === 'day') {
            const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
            const data = await getDayHistory(date);
            return NextResponse.json({ success: true, mode: 'day', date, data });
        }

        if (mode === 'heatmap') {
            const days = parseInt(searchParams.get('days') || '30');
            const data = await getHeatmapData(Math.min(days, 90));
            return NextResponse.json({ success: true, mode: 'heatmap', days, data });
        }

        if (mode === 'similar') {
            const rlsi = parseFloat(searchParams.get('rlsi') || '50');
            const gex = parseFloat(searchParams.get('gex') || '0');
            const days = parseInt(searchParams.get('days') || '30');
            const data = await findSimilarConditions(rlsi, gex, Math.min(days, 90));
            return NextResponse.json({ success: true, mode: 'similar', rlsi, gex, matches: data.length, data });
        }

        return NextResponse.json({ error: 'Invalid mode. Use: day, heatmap, similar' }, { status: 400 });

    } catch (error: any) {
        console.error('[Guardian History API]', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
