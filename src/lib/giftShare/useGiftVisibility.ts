'use client';
import { useCallback, useEffect, useRef } from 'react';
import { shareVia } from '@/lib/share/share';
import { giftFunnel } from './funnelClient';
import { observeGiftVisibility } from './visibility';

export function useGiftVisibility(surface: string) {
  const seen = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  return useCallback((node: HTMLElement | null) => {
    stop.current?.(); stop.current = null;
    if (node && !seen.current) stop.current = observeGiftVisibility(node, () => {
      seen.current = true;
      giftFunnel('visible', surface, shareVia());
    });
  }, [surface]);
}
