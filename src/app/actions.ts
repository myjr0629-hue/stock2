
"use server";

import { getStockData, getOptionsData } from "@/services/stockApi";
import { StockData, OptionData } from "@/services/stockTypes";

export async function fetchStockDataAction(ticker: string, range: any = '1d'): Promise<StockData | null> {
    try {
        return await getStockData(ticker, range);
    } catch (e) {
        console.error(`[ServerAction] Failed to fetch stock data for ${ticker}`, e);
        return null;
    }
}

export async function fetchOptionsDataAction(ticker: string): Promise<OptionData | null> {
    try {
        return await getOptionsData(ticker);
    } catch (e) {
        console.error(`[ServerAction] Failed to fetch options data for ${ticker}`, e);
        return null;
    }
}
