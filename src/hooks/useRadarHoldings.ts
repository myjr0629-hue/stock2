'use client';

import { useState, useCallback, useMemo } from 'react';

/**
 * Radar-only holdings — stored in localStorage, completely independent of main Portfolio (Supabase).
 * User manually registers what they ACTUALLY bought.
 */

export interface RadarHolding {
  ticker: string;
  name: string;
  quantity: number;
  avgPrice: number;
  addedAt: string; // ISO date
}

const STORAGE_KEY = 'radar_holdings';

function loadHoldings(): RadarHolding[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHoldings(holdings: RadarHolding[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
  } catch {
    // localStorage full or unavailable
  }
}

export function useRadarHoldings() {
  const [holdings, setHoldings] = useState<RadarHolding[]>(() => loadHoldings());

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
      } else {
        next = [...prev, {
          ticker: holding.ticker.toUpperCase(),
          name: holding.name || `${holding.ticker.toUpperCase()} Asset`,
          quantity: holding.quantity,
          avgPrice: holding.avgPrice,
          addedAt: new Date().toISOString(),
        }];
      }
      saveHoldings(next);
      return next;
    });
  }, []);

  const removeHolding = useCallback((ticker: string) => {
    setHoldings(prev => {
      const next = prev.filter(h => h.ticker.toUpperCase() !== ticker.toUpperCase());
      saveHoldings(next);
      return next;
    });
  }, []);

  const updateQuantity = useCallback((ticker: string, newQuantity: number) => {
    setHoldings(prev => {
      const next = newQuantity <= 0
        ? prev.filter(h => h.ticker.toUpperCase() !== ticker.toUpperCase())
        : prev.map(h =>
            h.ticker.toUpperCase() === ticker.toUpperCase()
              ? { ...h, quantity: newQuantity }
              : h
          );
      saveHoldings(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setHoldings([]);
    saveHoldings([]);
  }, []);

  const summary = useMemo(() => {
    const totalCost = holdings.reduce((sum, h) => sum + (h.quantity * h.avgPrice), 0);
    return {
      totalValue: totalCost, // This is cost basis only — live value is computed in the component
      totalCost,
      totalGainLoss: 0,
      totalGainLossPct: 0,
      holdingsCount: holdings.length,
    };
  }, [holdings]);

  return {
    holdings,
    summary,
    addHolding,
    removeHolding,
    updateQuantity,
    clearAll,
  };
}
