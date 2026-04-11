import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface MobileBottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export function MobileBottomSheet({ isOpen, onClose, title, children }: MobileBottomSheetProps) {
    // Prevent background scrolling when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    
                    {/* Sheet Content */}
                    <motion.div
                        className="fixed inset-x-0 bottom-0 z-[110] bg-slate-950 border-t border-slate-800 rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden max-h-[90vh]"
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        drag="y"
                        dragConstraints={{ top: 0 }}
                        dragElastic={0.2}
                        onDragEnd={(_, info) => {
                            // If dragged down far enough or fast enough, close it
                            if (info.offset.y > 100 || info.velocity.y > 500) {
                                onClose();
                            }
                        }}
                    >
                        {/* Drag Handle & Header */}
                        <div className="flex flex-col items-center pt-3 pb-2 px-4 border-b border-slate-800/50 bg-slate-900/50 sticky top-0 z-10 shrink-0">
                            <div className="w-12 h-1.5 rounded-full bg-slate-700/50 mb-4" />
                            <div className="flex items-center justify-between w-full">
                                <h2 className="text-xl font-bold font-jakarta px-2 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">{title}</h2>
                                <button 
                                    onClick={onClose}
                                    className="p-2 rounded-full hover:bg-slate-800 transition-colors"
                                >
                                    <X className="w-5 h-5 text-slate-400" />
                                </button>
                            </div>
                        </div>

                        {/* Scrolling Body */}
                        <div className="overflow-y-auto w-full p-4 pb-12 custom-scrollbar">
                            {children}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
