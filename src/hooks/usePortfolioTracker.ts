'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEYS = {
  HWM: 'radar_hwm',
  DAILY_NAV: 'radar_daily_nav',
  DAILY_DATE: 'radar_daily_date',
} as const;

function getStoredNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function getStoredString(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function setStored(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage may be full or unavailable
  }
}

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function usePortfolioTracker(currentNAV: number, totalCapital: number) {
  const [hwm, setHwm] = useState<number>(() =>
    getStoredNumber(STORAGE_KEYS.HWM, totalCapital)
  );

  const [dailyStartNAV, setDailyStartNAV] = useState<number>(() => {
    const today = getTodayDateString();
    const storedDate = getStoredString(STORAGE_KEYS.DAILY_DATE, '');

    if (storedDate === today) {
      return getStoredNumber(STORAGE_KEYS.DAILY_NAV, currentNAV);
    }
    return currentNAV;
  });

  // Reset daily NAV at the start of each new day
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const today = getTodayDateString();
    const storedDate = getStoredString(STORAGE_KEYS.DAILY_DATE, '');

    if (storedDate !== today) {
      setStored(STORAGE_KEYS.DAILY_NAV, String(currentNAV));
      setStored(STORAGE_KEYS.DAILY_DATE, today);
      setDailyStartNAV(currentNAV);
    }
  }, [currentNAV]);

  // Update HWM when currentNAV exceeds it
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (currentNAV > hwm) {
      setHwm(currentNAV);
      setStored(STORAGE_KEYS.HWM, String(currentNAV));
    }
  }, [currentNAV, hwm]);

  const drawdownPct =
    hwm > 0 ? ((currentNAV - hwm) / hwm) * 100 : 0;

  const dailyPnlPct =
    dailyStartNAV > 0
      ? ((currentNAV - dailyStartNAV) / dailyStartNAV) * 100
      : 0;

  return {
    hwm,
    drawdownPct,
    dailyPnlPct,
    dailyStartNAV,
  };
}
