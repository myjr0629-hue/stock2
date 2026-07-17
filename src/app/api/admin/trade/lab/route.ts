import { NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { getXsReport } from '@/lib/trade/fusion';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ENGINE LAB — the full quant state in one call: XS calibration table (the
// operational meaning of every score band), factor rolling ICs & weights,
// 3-variant race, plus the paper track's NAV history / open positions / trades.
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }));

export async function GET() {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;

  const [rep, navQ, posG, tradeQ] = await Promise.all([
    getXsReport(),
    ddb.send(new QueryCommand({
      TableName: 'signum-trade-journal',
      KeyConditionExpression: 'pk = :p', ExpressionAttributeValues: { ':p': 'NAV' },
      ScanIndexForward: false, Limit: 30,
    })).catch(() => ({ Items: [] as Record<string, unknown>[] })),
    ddb.send(new GetCommand({ TableName: 'signum-trade-journal', Key: { pk: 'POS', sk: '_OPEN_' } })).catch(() => ({ Item: undefined })),
    ddb.send(new QueryCommand({
      TableName: 'signum-trade-journal',
      KeyConditionExpression: 'pk = :p', ExpressionAttributeValues: { ':p': 'TRADE' },
      ScanIndexForward: false, Limit: 15,
    })).catch(() => ({ Items: [] as Record<string, unknown>[] })),
  ]);

  const nav = (navQ.Items ?? []).map((it) => ({ date: it.sk, nav: it.nav, tradingDay: it.tradingDay })).reverse();
  const positions = ((posG.Item?.list as Record<string, unknown>[] | undefined) ?? []);
  const trades = (tradeQ.Items ?? []).map((it) => ({
    sym: it.t, entryDate: it.entryDate, entryPx: it.entryPx, exitDate: it.exitDate, exitPx: it.exitPx,
    qty: it.qty, pnl: it.pnl, pnlPct: it.pnlPct, kill: it.kill ?? false,
  }));

  return NextResponse.json({
    ok: true,
    report: rep ? {
      date: rep.date, labeled: rep.labeled,
      calibration: rep.calibration ?? null,
      variants: rep.variants ?? null,
      rollingIC: rep.rollingIC ?? null,
      weights: rep.weights ?? null,
      top10: rep.top10 ?? null,
    } : null,
    paper: { nav, positions, trades },
  });
}
