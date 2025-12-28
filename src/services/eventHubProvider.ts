// [S-50.0] EventHub Provider - 7-Day Economic Calendar
// Source: Static JSON (MVP)

import path from 'path';
import fs from 'fs';

export interface EconomicEvent {
    date: string;           // YYYY-MM-DD
    time: string;           // HH:MM (ET)
    name: string;           // Event name (English)
    nameKR: string;         // Event name (Korean)
    importance: "HIGH" | "MEDIUM" | "LOW";
    expectedImpact: string; // Korean description of expected impact
    sourceGrade: "A" | "B" | "C";
    category: "FOMC" | "ECONOMIC" | "EARNINGS" | "OPTIONS" | "HOLIDAY" | "OTHER";
}

interface EventHubSnapshot {
    asOfET: string;
    events: EconomicEvent[];
    shakeReasons: string[];  // "오늘 흔들릴 이유 3가지"
}

const STATIC_DATA_PATH = path.join(process.cwd(), 'src', 'data', 'events.static.json');

function loadStaticEvents(): EconomicEvent[] {
    try {
        if (fs.existsSync(STATIC_DATA_PATH)) {
            const raw = fs.readFileSync(STATIC_DATA_PATH, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('[EventHub] Failed to load static events:', e);
    }
    return [];
}

function getETDate(): string {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function parseDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function getUpcomingEvents(days: number = 7): EconomicEvent[] {
    const events = loadStaticEvents();
    const now = new Date();
    const nowET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const cutoff = new Date(nowET);
    cutoff.setDate(cutoff.getDate() + days);

    return events
        .filter(e => {
            const eventDate = parseDate(e.date);
            return eventDate >= nowET && eventDate <= cutoff;
        })
        .sort((a, b) => {
            // Sort by date first, then by importance
            const dateCompare = a.date.localeCompare(b.date);
            if (dateCompare !== 0) return dateCompare;
            const importanceOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
            return importanceOrder[a.importance] - importanceOrder[b.importance];
        });
}

export function getTodayShakeReasons(limit: number = 3): string[] {
    const events = loadStaticEvents();
    const todayET = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).split('/').reverse().join('-'); // MM/DD/YYYY -> YYYY-MM-DD (rough)

    // Get today and tomorrow's HIGH importance events
    const relevantEvents = events
        .filter(e => e.importance === 'HIGH' || e.importance === 'MEDIUM')
        .filter(e => {
            const eventDate = parseDate(e.date);
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            return eventDate >= today && eventDate <= tomorrow;
        })
        .sort((a, b) => {
            const importanceOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
            return importanceOrder[a.importance] - importanceOrder[b.importance];
        })
        .slice(0, limit);

    return relevantEvents.map(e =>
        `${e.nameKR} (${e.date} ${e.time} ET) - ${e.expectedImpact}`
    );
}

export function getEventHubSnapshot(): EventHubSnapshot {
    const now = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        dateStyle: 'short',
        timeStyle: 'short'
    });

    return {
        asOfET: now,
        events: getUpcomingEvents(7),
        shakeReasons: getTodayShakeReasons(3)
    };
}
