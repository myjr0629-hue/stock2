'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportArchiveProps {
    currentDate: Date;
    onDateChange: (date: Date) => void;
    stage?: 'draft' | 'revised' | 'final' | 'eod' | 'pre' | 'open' | 'morning';
    isLoading?: boolean;
}

export function ReportArchive({ currentDate, onDateChange, stage, isLoading }: ReportArchiveProps) {

    // Helper to format date for input (YYYY-MM-DD)
    // toLocaleDateString('en-CA') returns YYYY-MM-DD in local time which is perfect for input value
    const dateValue = currentDate.toLocaleDateString("en-CA");

    const getStageBadgeColor = (s?: string) => {
        switch (s) {
            case 'final': return "bg-emerald-900 text-emerald-300 border-emerald-700"; // FINAL locked
            case 'revised': return "bg-amber-900 text-amber-300 border-amber-700"; // Audit
            case 'draft': return "bg-slate-800 text-slate-400 border-slate-600"; // Draft
            default: return "bg-slate-900 text-slate-500 border-slate-800";
        }
    };

    const getStageLabel = (s?: string) => {
        switch (s) {
            case 'final': return "FINAL ORDER";
            case 'revised': return "AUDIT REVISED";
            case 'draft': return "INITIAL DRAFT";
            default: return s?.toUpperCase() || "LIVE";
        }
    };

    const handlePrevious = () => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() - 1);
        onDateChange(d);
    };

    const handleNext = () => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + 1);
        onDateChange(d);
    };

    const handleDateInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.value) {
            // value is YYYY-MM-DD
            // new Date("YYYY-MM-DD") creates UTC date at 00:00 usually, but we want to preserve "day" concept.
            // Actually new Date("YYYY-MM-DD") is UTC.
            // new Date(y, m, d) is Local.
            // Let's parse manually to be safe or just use standard parse and accept 00:00 UTC if that's what our system uses.
            // System uses YYYY-MM-DD string for comparison, so UTC/Local overlap is fine IF consistent.
            // Best standard: Create date object treating input as "Noon Local" to avoid edge cases, or just standard parse.
            // Simple:
            const [y, m, d] = e.target.value.split('-').map(Number);
            const newDate = new Date(y, m - 1, d); // Local midnight
            onDateChange(newDate);
        }
    };

    // prevent future dates
    const isFuture = (d: Date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const check = new Date(d);
        check.setHours(0, 0, 0, 0);
        return check >= today;
    };

    return (
        <div className="flex items-center gap-2 bg-slate-950/50 p-1.5 rounded-lg border border-slate-800 backdrop-blur-sm">

            {/* Prev Day */}
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-white"
                onClick={handlePrevious}
                disabled={isLoading}
            >
                <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Native Date Input styled to look okay */}
            <div className="relative">
                <input
                    type="date"
                    value={dateValue}
                    onChange={handleDateInput}
                    className="h-8 w-[140px] bg-slate-900 border border-slate-700 text-slate-200 text-sm px-2 rounded focus:outline-none focus:border-indigo-500 uppercase font-mono"
                    max={new Date().toISOString().split('T')[0]}
                />
            </div>

            {/* Next Day */}
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-white"
                onClick={handleNext}
                disabled={isLoading || isFuture(currentDate)}
            >
                <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Stage Badge */}
            <Badge variant="outline" className={cn("ml-2 h-7 px-2 font-mono text-xs hidden md:inline-flex", getStageBadgeColor(stage))}>
                {isLoading ? (
                    <span className="animate-pulse">LOADING...</span>
                ) : (
                    <span className="flex items-center gap-1.5">
                        {stage === 'final' && <History className="w-3 h-3" />}
                        {getStageLabel(stage)}
                    </span>
                )}
            </Badge>

        </div>
    );
}
