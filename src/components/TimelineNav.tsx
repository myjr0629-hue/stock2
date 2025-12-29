"use client";

import React, { useEffect, useState } from 'react';
import { Clock, Calendar, ChevronRight } from 'lucide-react';

interface TimelineItem {
    date: string;
    types: string[];
    label: string;
}

interface TimelineNavProps {
    currentDate: string | null; // null = latest
    onSelectDate: (date: string | null) => void;
}

export function TimelineNav({ currentDate, onSelectDate }: TimelineNavProps) {
    const [timeline, setTimeline] = useState<TimelineItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchTimeline() {
            try {
                const res = await fetch('/api/reports/archives');
                if (res.ok) {
                    const data = await res.json();
                    setTimeline(data.timeline || []);
                }
            } catch (e) {
                console.error("Failed to load timeline", e);
            } finally {
                setLoading(false);
            }
        }
        fetchTimeline();
    }, []);

    if (loading) return <div className="h-8 w-24 bg-slate-800/50 animate-pulse rounded" />;
    if (timeline.length === 0) return null;

    // Show top 3 dates (Today, Yesterday, D-2)
    const displayItems = timeline.slice(0, 3);

    return (
        <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800/50">
            {/* "Latest" Button (Effective Today) */}
            <button
                onClick={() => onSelectDate(null)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-all flex items-center gap-2 ${!currentDate
                        ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                    }`}
            >
                <Clock className="w-3 h-3" />
                <span>LATEST</span>
            </button>

            <div className="w-px h-4 bg-slate-800 mx-1" />

            {/* Historical Tabs */}
            {displayItems.map((item) => {
                // Skip "Today" in historical list if we consider "Latest" to be mostly today
                // But "Latest" might be pre-market or live. 
                // Let's just list the dates. If item.label is 'Today', it might overlap with Latest content-wise, 
                // but technical "archive" viewing is distinct from "live/latest".

                const isActive = currentDate === item.date;

                return (
                    <button
                        key={item.date}
                        onClick={() => onSelectDate(item.date)}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all flex items-center gap-1.5 ${isActive
                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                            }`}
                    >
                        <span>{item.label}</span>
                        {/* Future: Add Trend Badge here */}
                        {/* <span className="text-[9px] bg-slate-800 text-slate-500 px-1 rounded">▲2</span> */}
                    </button>
                );
            })}

            {timeline.length > 3 && (
                <button className="px-2 py-1.5 text-slate-600 hover:text-slate-400">
                    <ChevronRight className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}
