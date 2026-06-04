'use client';

import { useState, useCallback, useMemo } from 'react';

/**
 * Radar-only holdings — stored in localStorage, completely independent of main Portfolio (Supabase).
 * User manually registers what they ACTUALLY bought.
 * Includes Trade Journal for compound growth tracking.
 */

export interface RadarHolding {
  ticker: string;
  name: string;
  quantity: number;
  avgPrice: number;
  addedAt: string; // ISO date
}

export interface TradeRecord {
  id: string;
  ticker: string;
  action: 'BUY' | 'SELL' | 'LIQUIDATE' | 'ADD' | 'ROTATE_OUT' | 'ROTATE_IN';
  quantity: number;
  price: number;
  totalValue: number;
  realizedPnl?: number; // Only for SELL/LIQUIDATE/ROTATE_OUT
  realizedPnlPct?: number;
  timestamp: string; // ISO date
  note?: string;
}

export interface CompoundSnapshot {
  date: string; // YYYY-MM-DD
  nav: number;
  capitalBase: number; // Original capital input
  realizedPnl: number; // Cumulative realized P&L
  tradeCount: number;
  winCount: number;
}

const STORAGE_KEYS = {
  HOLDINGS: 'radar_holdings',
  JOURNAL: 'radar_trade_journal',
  SNAPSHOTS: 'radar_compound_snapshots',
  REALIZED_PNL: 'radar_realized_pnl',
} as const;

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage full or unavailable
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useRadarHoldings() {
  const [holdings, setHoldings] = useState<RadarHolding[]>(() => loadFromStorage(STORAGE_KEYS.HOLDINGS, []));
  const [journal, setJournal] = useState<TradeRecord[]>(() => loadFromStorage(STORAGE_KEYS.JOURNAL, []));
  const [cumulativeRealizedPnl, setCumulativeRealizedPnl] = useState<number>(() => loadFromStorage(STORAGE_KEYS.REALIZED_PNL, 0));

  // Record a trade in the journal
  const recordTrade = useCallback((trade: Omit<TradeRecord, 'id' | 'timestamp'>) => {
    const record: TradeRecord = {
      ...trade,
      id: generateId(),
      timestamp: new Date().toISOString(),
    };
    setJournal(prev => {
      const next = [record, ...prev].slice(0, 500); // Keep last 500 trades
      saveToStorage(STORAGE_KEYS.JOURNAL, next);
      return next;
    });
    // Update cumulative realized P&L
    if (trade.realizedPnl !== undefined && trade.realizedPnl !== 0) {
      setCumulativeRealizedPnl(prev => {
        const next = prev + trade.realizedPnl!;
        saveToStorage(STORAGE_KEYS.REALIZED_PNL, next);
        return next;
      });
    }
    return record;
  }, []);

  const addHolding = useCallback((holding: Omit<RadarHolding, 'addedAt'>) => {
    setHoldings(prev => {
      const existing = prev.find(h => h.ticker.toUpperCase() === holding.ticker.toUpperCase());
      let next: RadarHolding[];
      if (existing) {
        // Average up/down: combine quantity and recalculate avgPrice
        const totalQty = existing.quantity + holding.quantity;
        const totalCost = (existing.quantity * existing.avgPrice) + (holding.quantity * holding.avgPrice);
        const newAvgPrice = totalQty > 0 ? totalCost / totalQty : holding.avgPrice;
        next = prev.map(h =>
          h.ticker.toUpperCase() === holding.ticker.toUpperCase()
            ? { ...h, quantity: totalQty, avgPrice: Math.round(newAvgPrice * 100) / 100 }
            : h
        );
        // Record ADD trade
        recordTrade({
          ticker: holding.ticker.toUpperCase(),
          action: 'ADD',
          quantity: holding.quantity,
          price: holding.avgPrice,
          totalValue: holding.quantity * holding.avgPrice,
        });
      } else {
        next = [...prev, {
          ticker: holding.ticker.toUpperCase(),
          name: holding.name || `${holding.ticker.toUpperCase()} Asset`,
          quantity: holding.quantity,
          avgPrice: holding.avgPrice,
          addedAt: new Date().toISOString(),
        }];
        // Record BUY trade
        recordTrade({
          ticker: holding.ticker.toUpperCase(),
          action: 'BUY',
          quantity: holding.quantity,
          price: holding.avgPrice,
          totalValue: holding.quantity * holding.avgPrice,
        });
      }
      saveToStorage(STORAGE_KEYS.HOLDINGS, next);
      return next;
    });
  }, [recordTrade]);

  const removeHolding = useCallback((ticker: string, sellPrice?: number) => {
    setHoldings(prev => {
      const existing = prev.find(h => h.ticker.toUpperCase() === ticker.toUpperCase());
      if (existing) {
        const price = sellPrice || existing.avgPrice;
        const realizedPnl = (price - existing.avgPrice) * existing.quantity;
        const realizedPnlPct = existing.avgPrice > 0 ? ((price - existing.avgPrice) / existing.avgPrice) * 100 : 0;
        // Record LIQUIDATE trade
        recordTrade({
          ticker: ticker.toUpperCase(),
          action: 'LIQUIDATE',
          quantity: existing.quantity,
          price,
          totalValue: existing.quantity * price,
          realizedPnl,
          realizedPnlPct,
        });
      }
      const next = prev.filter(h => h.ticker.toUpperCase() !== ticker.toUpperCase());
      saveToStorage(STORAGE_KEYS.HOLDINGS, next);
      return next;
    });
  }, [recordTrade]);

  const updateQuantity = useCallback((ticker: string, newQuantity: number, price?: number) => {
    setHoldings(prev => {
      const existing = prev.find(h => h.ticker.toUpperCase() === ticker.toUpperCase());
      if (existing && newQuantity < existing.quantity && price) {
        // Partial sell — record trade
        const soldQty = existing.quantity - newQuantity;
        const realizedPnl = (price - existing.avgPrice) * soldQty;
        const realizedPnlPct = existing.avgPrice > 0 ? ((price - existing.avgPrice) / existing.avgPrice) * 100 : 0;
        recordTrade({
          ticker: ticker.toUpperCase(),
          action: 'SELL',
          quantity: soldQty,
          price,
          totalValue: soldQty * price,
          realizedPnl,
          realizedPnlPct,
        });
      }
      const next = newQuantity <= 0
        ? prev.filter(h => h.ticker.toUpperCase() !== ticker.toUpperCase())
        : prev.map(h =>
            h.ticker.toUpperCase() === ticker.toUpperCase()
              ? { ...h, quantity: newQuantity }
              : h
          );
      saveToStorage(STORAGE_KEYS.HOLDINGS, next);
      return next;
    });
  }, [recordTrade]);

  const clearAll = useCallback(() => {
    setHoldings([]);
    saveToStorage(STORAGE_KEYS.HOLDINGS, []);
  }, []);

  // Record a daily compound snapshot
  const recordSnapshot = useCallback((nav: number, capitalBase: number) => {
    const today = new Date().toISOString().slice(0, 10);
    const snapshots = loadFromStorage<CompoundSnapshot[]>(STORAGE_KEYS.SNAPSHOTS, []);
    const existingIdx = snapshots.findIndex(s => s.date === today);
    
    const winTrades = journal.filter(t => (t.realizedPnl || 0) > 0).length;
    const totalTrades = journal.filter(t => t.realizedPnl !== undefined).length;
    
    const snapshot: CompoundSnapshot = {
      date: today,
      nav,
      capitalBase,
      realizedPnl: cumulativeRealizedPnl,
      tradeCount: totalTrades,
      winCount: winTrades,
    };
    
    if (existingIdx >= 0) {
      snapshots[existingIdx] = snapshot;
    } else {
      snapshots.push(snapshot);
    }
    
    // Keep last 365 days
    const trimmed = snapshots.slice(-365);
    saveToStorage(STORAGE_KEYS.SNAPSHOTS, trimmed);
    return trimmed;
  }, [journal, cumulativeRealizedPnl]);

  const getSnapshots = useCallback((): CompoundSnapshot[] => {
    return loadFromStorage<CompoundSnapshot[]>(STORAGE_KEYS.SNAPSHOTS, []);
  }, []);

  const summary = useMemo(() => {
    const totalCost = holdings.reduce((sum, h) => sum + (h.quantity * h.avgPrice), 0);
    return {
      totalValue: totalCost, // Cost basis — live value computed in component
      totalCost,
      totalGainLoss: 0,
      totalGainLossPct: 0,
      holdingsCount: holdings.length,
    };
  }, [holdings]);

  // Trade journal stats
  const journalStats = useMemo(() => {
    const closedTrades = journal.filter(t => t.realizedPnl !== undefined);
    const wins = closedTrades.filter(t => (t.realizedPnl || 0) > 0);
    const losses = closedTrades.filter(t => (t.realizedPnl || 0) < 0);
    const totalPnl = closedTrades.reduce((s, t) => s + (t.realizedPnl || 0), 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.realizedPnl || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + (t.realizedPnl || 0), 0) / losses.length : 0;
    
    return {
      totalTrades: closedTrades.length,
      winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
      totalPnl,
      avgWin,
      avgLoss,
      expectancy: closedTrades.length > 0 
        ? (wins.length / closedTrades.length) * avgWin + (losses.length / closedTrades.length) * avgLoss
        : 0,
      profitFactor: Math.abs(avgLoss) > 0 ? avgWin / Math.abs(avgLoss) : 0,
    };
  }, [journal]);

  return {
    holdings,
    summary,
    journal,
    journalStats,
    cumulativeRealizedPnl,
    addHolding,
    removeHolding,
    updateQuantity,
    clearAll,
    recordTrade,
    recordSnapshot,
    getSnapshots,
  };
}
