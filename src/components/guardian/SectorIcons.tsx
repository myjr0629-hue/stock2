
import {
    Cpu,          // XLK - Tech
    Zap,          // XLE - Energy
    HeartPulse,   // XLV - Health
    Landmark,     // XLF - Financials
    ShoppingBag,  // XLY - Discretionary
    ShoppingCart, // XLP - Staples
    HardHat,      // XLI - Industrial
    Pickaxe,      // XLB - Materials (using Pickaxe/Hammer)
    Wifi,         // XLC - Comm
    Building2,    // XLRE - Real Estate
    Droplets      // XLU - Utilities
} from "lucide-react";

export interface SectorVisualInfo {
    icon: React.ElementType;
    color: string;
    label: string;
}

export const SECTOR_VISUALS: Record<string, SectorVisualInfo> = {
    "XLK": { icon: Cpu, color: "#3b82f6", label: "Technology" },        // Blue-500
    "XLE": { icon: Zap, color: "#f59e0b", label: "Energy" },            // Amber-500
    "XLV": { icon: HeartPulse, color: "#ec4899", label: "Healthcare" }, // Pink-500
    "XLF": { icon: Landmark, color: "#10b981", label: "Financials" },   // Emerald-500 (Market Money)
    "XLY": { icon: ShoppingBag, color: "#8b5cf6", label: "Cons. Disc" }, // Violet-500
    "XLP": { icon: ShoppingCart, color: "#64748b", label: "Staples" },  // Slate-500 (Reliable)
    "XLI": { icon: HardHat, color: "#f97316", label: "Industrials" },   // Orange-500
    "XLB": { icon: Pickaxe, color: "#a855f7", label: "Materials" },     // Purple-500
    "XLC": { icon: Wifi, color: "#06b6d4", label: "Comm." },            // Cyan-500
    "XLRE": { icon: Building2, color: "#14b8a6", label: "Real Estate" },// Teal-500
    "XLU": { icon: Droplets, color: "#3b82f6", label: "Utilities" }     // Blue-500 (Water/Elec)
};

// Pastel/Matte variants for background fills to avoid "Blinding Neon"
export const SECTOR_BG_COLORS: Record<string, string> = {
    "XLK": "rgba(59, 130, 246, 0.15)",
    "XLE": "rgba(245, 158, 11, 0.15)",
    "XLV": "rgba(236, 72, 153, 0.15)",
    "XLF": "rgba(16, 185, 129, 0.15)",
    "XLY": "rgba(139, 92, 246, 0.15)",
    "XLP": "rgba(100, 116, 139, 0.15)",
    "XLI": "rgba(249, 115, 22, 0.15)",
    "XLB": "rgba(168, 85, 247, 0.15)",
    "XLC": "rgba(6, 182, 212, 0.15)",
    "XLRE": "rgba(20, 184, 166, 0.15)",
    "XLU": "rgba(59, 130, 246, 0.15)"
};
