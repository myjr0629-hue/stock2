// Portfolio LocalStorage Store
// Manages user's portfolio holdings with persistence

export interface AlphaSnapshot {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    action: 'HOLD' | 'ADD' | 'TRIM' | 'WATCH';
    confidence: number;
    capturedAt: string;
}

export interface Holding {
    ticker: string;
    name: string;
    quantity: number;
    avgPrice: number;
    addedAt: string;
    alphaSnapshot?: AlphaSnapshot;
}

export interface PortfolioData {
    holdings: Holding[];
    updatedAt: string;
}

const STORAGE_KEY = 'alpha_portfolio_v1';

// Get portfolio from LocalStorage
export function getPortfolio(): PortfolioData {
    if (typeof window === 'undefined') {
        return { holdings: [], updatedAt: new Date().toISOString() };
    }

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load portfolio:', e);
    }

    return { holdings: [], updatedAt: new Date().toISOString() };
}

// Save portfolio to LocalStorage
export function savePortfolio(data: PortfolioData): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...data,
            updatedAt: new Date().toISOString()
        }));
    } catch (e) {
        console.error('Failed to save portfolio:', e);
    }
}

// Add a new holding
export function addHolding(holding: Omit<Holding, 'addedAt'>): PortfolioData {
    const current = getPortfolio();

    // Check if ticker already exists
    const existingIndex = current.holdings.findIndex(h => h.ticker === holding.ticker);

    if (existingIndex >= 0) {
        // Average down/up existing holding
        const existing = current.holdings[existingIndex];
        const totalShares = existing.quantity + holding.quantity;
        const avgPrice = ((existing.avgPrice * existing.quantity) + (holding.avgPrice * holding.quantity)) / totalShares;

        current.holdings[existingIndex] = {
            ...existing,
            quantity: totalShares,
            avgPrice: Math.round(avgPrice * 100) / 100
        };
    } else {
        // Add new holding
        current.holdings.push({
            ...holding,
            addedAt: new Date().toISOString()
        });
    }

    savePortfolio(current);
    return current;
}

// Remove a holding
export function removeHolding(ticker: string): PortfolioData {
    const current = getPortfolio();
    current.holdings = current.holdings.filter(h => h.ticker !== ticker);
    savePortfolio(current);
    return current;
}

// Update a holding
export function updateHolding(ticker: string, updates: Partial<Holding>): PortfolioData {
    const current = getPortfolio();
    const index = current.holdings.findIndex(h => h.ticker === ticker);

    if (index >= 0) {
        current.holdings[index] = { ...current.holdings[index], ...updates };
        savePortfolio(current);
    }

    return current;
}

// Clear all holdings
export function clearPortfolio(): PortfolioData {
    const empty: PortfolioData = { holdings: [], updatedAt: new Date().toISOString() };
    savePortfolio(empty);
    return empty;
}

// Demo data for development - using tickers from report universe
export function loadDemoPortfolio(): PortfolioData {
    const demo: PortfolioData = {
        holdings: [
            { ticker: 'AMD', name: 'Advanced Micro Devices', quantity: 15, avgPrice: 135, addedAt: '2024-01-15T00:00:00Z' },
            { ticker: 'INTC', name: 'Intel Corp', quantity: 40, avgPrice: 45, addedAt: '2024-02-01T00:00:00Z' },
            { ticker: 'COIN', name: 'Coinbase Global', quantity: 8, avgPrice: 175, addedAt: '2024-01-20T00:00:00Z' },
            { ticker: 'BA', name: 'Boeing Co', quantity: 10, avgPrice: 195, addedAt: '2024-02-10T00:00:00Z' },
            { ticker: 'V', name: 'Visa Inc', quantity: 12, avgPrice: 270, addedAt: '2024-01-25T00:00:00Z' },
        ],
        updatedAt: new Date().toISOString()
    };
    savePortfolio(demo);
    return demo;
}
