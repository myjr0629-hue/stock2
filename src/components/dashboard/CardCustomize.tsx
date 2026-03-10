"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    rectSortingStrategy,
    useSortable,
    arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Settings, GripVertical, Check, X, Eye, EyeOff, Lock } from "lucide-react";

// ══════ Card Registry — All 20 available indicators ══════
export interface CardDef {
    id: string;
    label: string;
    category: 'structure' | 'options' | 'momentum' | 'flow';
    proOnly?: boolean;
    eliteOnly?: boolean;
}

export const ALL_CARDS: CardDef[] = [
    // Structure (Row 1 defaults)
    { id: 'netGex', label: 'NET GEX', category: 'structure', proOnly: true },
    { id: 'gammaFlip', label: 'GAMMA FLIP', category: 'structure', proOnly: true },
    { id: 'squeeze', label: 'SQUEEZE', category: 'structure', proOnly: true },
    { id: 'vwapDist', label: 'VWAP DIST', category: 'structure' },
    // Options (Row 2 defaults)
    { id: 'maxPain', label: 'MAX PAIN', category: 'options', proOnly: true },
    { id: 'callPutWall', label: 'CALL/PUT WALL', category: 'options', proOnly: true },
    { id: 'darkPool', label: 'DARK POOL %', category: 'options', proOnly: true },
    { id: 'shortVol', label: 'SHORT VOL %', category: 'options', proOnly: true },
    // Flow (Row 3 defaults)
    { id: 'atmIv', label: 'ATM IV', category: 'options', proOnly: true },
    { id: 'pcRatio', label: 'P/C RATIO', category: 'options' },
    { id: 'gexRegime', label: 'GEX REGIME', category: 'structure', eliteOnly: true },
    { id: 'impliedMove', label: 'IMPLIED MOVE', category: 'options', eliteOnly: true },
    // ── Additional Pool (8 more) ──
    { id: 'alphaScore', label: 'ALPHA SCORE', category: 'momentum', proOnly: true },
    { id: 'whaleIndex', label: 'WHALE INDEX', category: 'flow', proOnly: true },
    { id: 'rsi14', label: 'RSI 14', category: 'momentum' },
    { id: 'return3d', label: 'RETURN 3D', category: 'momentum' },
    { id: 'relVolume', label: 'REL VOLUME', category: 'momentum' },
    { id: 'opi', label: 'OPI', category: 'flow', proOnly: true },
    { id: 'smartMoney', label: 'SMART MONEY', category: 'flow', eliteOnly: true },
    { id: 'ivRank', label: 'IV RANK', category: 'options', proOnly: true },
];

export const DEFAULT_CARD_ORDER = ALL_CARDS.slice(0, 12).map(c => c.id);

// ══════ Sortable Card Wrapper ══════
function SortableCard({ id, children, isEditing }: { id: string; children: React.ReactNode; isEditing: boolean }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled: !isEditing });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.7 : 1,
    };

    return (
        <div ref={setNodeRef} style={style as any} {...attributes} className="relative">
            {isEditing && (
                <div
                    {...listeners}
                    className="absolute top-1 right-1 z-20 p-1 rounded bg-slate-700/80 cursor-grab active:cursor-grabbing hover:bg-slate-600/80 transition-colors"
                    title="Drag to reorder"
                >
                    <GripVertical className="w-3.5 h-3.5 text-slate-300" />
                </div>
            )}
            {children}
        </div>
    );
}

// ══════ Card Selector Modal ══════
function CardSelectorModal({
    visibleCards,
    onToggleCard,
    onClose,
    tier,
}: {
    visibleCards: string[];
    onToggleCard: (cardId: string) => void;
    onClose: () => void;
    tier: string;
}) {
    const CATEGORY_LABELS: Record<string, string> = {
        structure: 'Market Structure',
        options: 'Options',
        momentum: 'Momentum',
        flow: 'Flow',
    };

    const categories = ['structure', 'options', 'momentum', 'flow'];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}>
            <div className="bg-[#0d1829] border border-white/10 rounded-xl p-5 w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold text-lg">Select Indicators</h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <p style={{ fontSize: '13px' }} className="text-slate-300 mb-4">
                    Choose up to 12 indicators for your dashboard. Drag to reorder after selection.
                </p>

                {categories.map(cat => (
                    <div key={cat} className="mb-4">
                        <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                            {CATEGORY_LABELS[cat]}
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                            {ALL_CARDS.filter(c => c.category === cat).map(card => {
                                const isVisible = visibleCards.includes(card.id);
                                const isLocked = (card.proOnly || card.eliteOnly) && (tier === 'free' || tier === 'guest');
                                return (
                                    <button
                                        key={card.id}
                                        onClick={() => !isLocked && onToggleCard(card.id)}
                                        className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all ${isVisible
                                            ? 'bg-cyan-500/10 border-cyan-500/30 text-white'
                                            : isLocked
                                                ? 'bg-slate-800/50 border-white/5 text-slate-500 cursor-not-allowed'
                                                : 'bg-slate-800/50 border-white/5 text-slate-400 hover:border-white/20'
                                            }`}
                                    >
                                        {isVisible ? (
                                            <Eye className="w-4 h-4 text-cyan-400" />
                                        ) : isLocked ? (
                                            <Lock className="w-4 h-4 text-slate-600" />
                                        ) : (
                                            <EyeOff className="w-4 h-4 text-slate-500" />
                                        )}
                                        <span style={{ fontSize: '13px' }} className="font-medium">{card.label}</span>
                                        {card.proOnly && (
                                            <span className="ml-auto text-[10px] font-bold px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">PRO</span>
                                        )}
                                        {card.eliteOnly && (
                                            <span className="ml-auto text-[10px] font-bold px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">ELITE</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}

                <div className="flex justify-between items-center pt-3 border-t border-white/5">
                    <span style={{ fontSize: '12px' }} className="text-slate-400">
                        {visibleCards.length}/12 selected
                    </span>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 font-bold text-sm hover:bg-cyan-500/30 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

// ══════ Main Hook: useCardCustomize ══════
export function useCardCustomize(tier: string) {
    const [cardOrder, setCardOrder] = useState<string[]>(DEFAULT_CARD_ORDER);
    const [isEditing, setIsEditing] = useState(false);
    const [showSelector, setShowSelector] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load preferences on mount
    useEffect(() => {
        const loadPrefs = async () => {
            // Try API first (logged in users)
            try {
                const res = await fetch('/api/dashboard/preferences');
                if (res.ok) {
                    const data = await res.json();
                    if (data.preferences?.cardOrder) {
                        setCardOrder(data.preferences.cardOrder);
                        setIsLoaded(true);
                        return;
                    }
                }
            } catch { /* continue */ }

            // Fallback: localStorage
            try {
                const stored = localStorage.getItem('dashboard-card-order');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setCardOrder(parsed);
                    }
                }
            } catch { /* use defaults */ }
            setIsLoaded(true);
        };
        loadPrefs();
    }, []);

    // Save preferences
    const savePrefs = useCallback(async (newOrder: string[]) => {
        // Save to localStorage immediately (fast)
        localStorage.setItem('dashboard-card-order', JSON.stringify(newOrder));

        // Save to API (persistent)
        try {
            await fetch('/api/dashboard/preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardOrder: newOrder, visibleCards: newOrder }),
            });
        } catch { /* localStorage is fallback */ }
    }, []);

    // Handle drag end
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setCardOrder(prev => {
            const oldIndex = prev.indexOf(String(active.id));
            const newIndex = prev.indexOf(String(over.id));
            const newOrder = arrayMove(prev, oldIndex, newIndex);
            savePrefs(newOrder);
            return newOrder;
        });
    }, [savePrefs]);

    // Toggle card visibility
    const toggleCard = useCallback((cardId: string) => {
        setCardOrder(prev => {
            let newOrder: string[];
            if (prev.includes(cardId)) {
                if (prev.length <= 4) return prev; // Min 4 cards
                newOrder = prev.filter(id => id !== cardId);
            } else {
                if (prev.length >= 12) return prev; // Max 12 cards
                newOrder = [...prev, cardId];
            }
            savePrefs(newOrder);
            return newOrder;
        });
    }, [savePrefs]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    return {
        cardOrder,
        isEditing,
        setIsEditing,
        showSelector,
        setShowSelector,
        isLoaded,
        handleDragEnd,
        toggleCard,
        sensors,
        SortableCard,
        CardSelectorModal,
    };
}
