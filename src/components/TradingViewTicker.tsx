"use client";

import React, { useEffect, useRef, memo } from 'react';

/**
 * TradingViewTicker - Original TradingView Widget
 * 
 * VIX shows VIXY ETF price (~$25) - NOT the actual VIX index
 * DXY shows UUP ETF price (~$27) - NOT the actual DXY index
 * 
 * For accurate VIX/DXY values (15.12, 99.07), see the engine data in Guardian page.
 * This widget is kept for visual consistency with TradingView's standard look & feel.
 */
export const TradingViewTicker = memo(() => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Clear previous scripts to prevent duplicates
        containerRef.current.innerHTML = '';

        const script = document.createElement('script');
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
        script.async = true;
        script.innerHTML = JSON.stringify({
            "symbols": [
                { "proName": "FOREXCOM:NAS100", "title": "NASDAQ 100" },
                { "proName": "FOREXCOM:SPX500", "title": "S&P 500" },
                { "proName": "TVC:GOLD", "title": "GOLD" },
                { "proName": "TVC:USOIL", "title": "OIL (WTI)" },
                { "proName": "BINANCE:BTCUSDT", "title": "BITCOIN" },
                { "proName": "FOREXCOM:NAS100", "title": "NASDAQ 100" },
                { "proName": "FOREXCOM:SPX500", "title": "S&P 500" },
                { "proName": "TVC:GOLD", "title": "GOLD" },
                { "proName": "TVC:USOIL", "title": "OIL (WTI)" },
                { "proName": "BINANCE:BTCUSDT", "title": "BITCOIN" },
                { "proName": "FOREXCOM:NAS100", "title": "NASDAQ 100" },
                { "proName": "FOREXCOM:SPX500", "title": "S&P 500" },
                { "proName": "TVC:GOLD", "title": "GOLD" },
                { "proName": "TVC:USOIL", "title": "OIL (WTI)" },
                { "proName": "BINANCE:BTCUSDT", "title": "BITCOIN" },
                { "proName": "FOREXCOM:NAS100", "title": "NASDAQ 100" },
                { "proName": "FOREXCOM:SPX500", "title": "S&P 500" },
                { "proName": "TVC:GOLD", "title": "GOLD" },
                { "proName": "TVC:USOIL", "title": "OIL (WTI)" },
                { "proName": "BINANCE:BTCUSDT", "title": "BITCOIN" },
                { "proName": "FOREXCOM:NAS100", "title": "NASDAQ 100" },
                { "proName": "FOREXCOM:SPX500", "title": "S&P 500" },
                { "proName": "TVC:GOLD", "title": "GOLD" },
                { "proName": "TVC:USOIL", "title": "OIL (WTI)" },
                { "proName": "BINANCE:BTCUSDT", "title": "BITCOIN" },
                { "proName": "FOREXCOM:NAS100", "title": "NASDAQ 100" },
                { "proName": "FOREXCOM:SPX500", "title": "S&P 500" },
                { "proName": "TVC:GOLD", "title": "GOLD" },
                { "proName": "TVC:USOIL", "title": "OIL (WTI)" },
                { "proName": "BINANCE:BTCUSDT", "title": "BITCOIN" },
                { "proName": "FOREXCOM:NAS100", "title": "NASDAQ 100" },
                { "proName": "FOREXCOM:SPX500", "title": "S&P 500" },
                { "proName": "TVC:GOLD", "title": "GOLD" },
                { "proName": "TVC:USOIL", "title": "OIL (WTI)" },
                { "proName": "BINANCE:BTCUSDT", "title": "BITCOIN" },
                { "proName": "FOREXCOM:NAS100", "title": "NASDAQ 100" },
                { "proName": "FOREXCOM:SPX500", "title": "S&P 500" },
                { "proName": "TVC:GOLD", "title": "GOLD" },
                { "proName": "TVC:USOIL", "title": "OIL (WTI)" },
                { "proName": "BINANCE:BTCUSDT", "title": "BITCOIN" }
            ],
            "showSymbolLogo": true,
            "isTransparent": true,
            "displayMode": "regular",
            "colorTheme": "dark",
            "locale": "en"
        });

        // Add wrapper to style it specifically if needed
        const wrapper = document.createElement('div');
        wrapper.className = "tradingview-widget-container__widget";
        containerRef.current.appendChild(wrapper);
        containerRef.current.appendChild(script);

    }, []);

    // Using CSS zoom instead of transform scale - zoom respects layout flow
    // This ensures the widget starts from x=0 and fills the full viewport width
    return (
        <div className="w-full bg-[#0a0f1a] h-[30px] overflow-hidden relative z-40">
            <div
                className="tradingview-widget-container w-full"
                ref={containerRef}
                style={{ zoom: 0.75 }}
            >
                <div className="tradingview-widget-container__widget w-full h-full"></div>
            </div>
        </div>
    );
});

TradingViewTicker.displayName = "TradingViewTicker";
