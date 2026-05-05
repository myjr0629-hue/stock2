'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';

interface GuideSearchFilterProps {
    /** CSS selector for the scrollable content container */
    contentSelector?: string;
}

/**
 * GuideSearchFilter — Client-side text search within Guide pages.
 * Finds all `<section>` elements inside the content area and hides
 * those whose textContent does not match the query.
 * Institutional-grade: 12px minimum, slate-300 palette, Lucide icons only.
 */
export function GuideSearchFilter({ contentSelector = '.guide-content' }: GuideSearchFilterProps) {
    const [query, setQuery] = useState('');
    const [matchCount, setMatchCount] = useState<number | null>(null);
    const [totalCount, setTotalCount] = useState<number>(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const performFilter = useCallback((searchText: string) => {
        const container = document.querySelector(contentSelector);
        if (!container) return;

        // Get all top-level sections inside the content wrapper
        const sections = container.querySelectorAll(':scope > section');
        setTotalCount(sections.length);

        if (!searchText.trim()) {
            // Show all sections
            sections.forEach((section) => {
                (section as HTMLElement).style.display = '';
                // Remove any highlights
                section.querySelectorAll('mark[data-guide-highlight]').forEach((mark) => {
                    const parent = mark.parentNode;
                    if (parent) {
                        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
                        parent.normalize();
                    }
                });
            });
            setMatchCount(null);
            return;
        }

        const normalizedQuery = searchText.toLowerCase().trim();
        let matches = 0;

        sections.forEach((section) => {
            const el = section as HTMLElement;
            const text = el.textContent?.toLowerCase() || '';
            if (text.includes(normalizedQuery)) {
                el.style.display = '';
                matches++;
            } else {
                el.style.display = 'none';
            }
        });

        setMatchCount(matches);
    }, [contentSelector]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            performFilter(query);
        }, 200);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, performFilter]);

    // Restore all sections on unmount
    useEffect(() => {
        return () => {
            const container = document.querySelector(contentSelector);
            if (!container) return;
            container.querySelectorAll(':scope > section').forEach((section) => {
                (section as HTMLElement).style.display = '';
            });
        };
    }, [contentSelector]);

    // Keyboard shortcut: Ctrl+K / Cmd+K to focus
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
            // Escape to clear
            if (e.key === 'Escape' && document.activeElement === inputRef.current) {
                setQuery('');
                inputRef.current?.blur();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    return (
        <div className="relative group">
            <div className="relative flex items-center">
                <Search
                    size={14}
                    className="absolute left-3 text-slate-500 group-focus-within:text-cyan-400 transition-colors pointer-events-none"
                />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search guide sections..."
                    className="w-full pl-9 pr-20 py-2 text-[13px] text-slate-200 placeholder:text-slate-500
                               bg-white/[0.04] border border-white/[0.08] rounded-xl
                               focus:outline-none focus:border-cyan-500/40 focus:bg-white/[0.06]
                               focus:ring-1 focus:ring-cyan-500/20
                               transition-all duration-200"
                />
                {/* Right side: match count + shortcut hint / clear button */}
                <div className="absolute right-2 flex items-center gap-1.5">
                    {query ? (
                        <>
                            {matchCount !== null && (
                                <span className="text-[11px] text-slate-500 tabular-nums">
                                    {matchCount}/{totalCount}
                                </span>
                            )}
                            <button
                                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                                className="p-1 rounded-md hover:bg-white/[0.08] text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                <X size={12} />
                            </button>
                        </>
                    ) : (
                        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-slate-500 border border-white/[0.08] rounded-md bg-white/[0.03]">
                            <span className="text-[9px]">⌘</span>K
                        </kbd>
                    )}
                </div>
            </div>
        </div>
    );
}
