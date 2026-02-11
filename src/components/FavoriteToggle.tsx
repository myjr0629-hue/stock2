
"use client";

import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/hooks/useFavorites";

export function FavoriteToggle({ ticker, name }: { ticker: string; name?: string }) {
    const { isFavorite, toggleFavorite } = useFavorites();
    const active = isFavorite(ticker);

    return (
        <Button
            variant="ghost"
            size="icon"
            className={`ml-3 rounded-full transition-all duration-300 ${active ? "bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-500"}`}
            onClick={(e) => {
                e.preventDefault();
                toggleFavorite(ticker, name);
            }}
            title={active ? "Remove from Watchlist" : "Add to Watchlist"}
        >
            <Heart className={`w-6 h-6 transition-transform ${active ? "fill-current scale-110" : "scale-100"}`} />
        </Button>
    );
}
