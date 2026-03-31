"use client";

import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallbackTitle?: string;
    fallbackMessage?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * Catches unhandled client-side exceptions and renders a graceful fallback
 * instead of Next.js's "Application error: a client-side exception has occurred" blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[ErrorBoundary] Caught error:', error.message, errorInfo.componentStack);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-[400px] flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-[#0d1829]/90 border border-rose-500/20 rounded-xl p-6 backdrop-blur-md text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 mb-4">
                            <AlertTriangle className="w-6 h-6 text-rose-400" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">
                            {this.props.fallbackTitle || 'Component Error'}
                        </h3>
                        <p className="text-sm text-slate-400 mb-4">
                            {this.props.fallbackMessage || 'An error occurred while rendering this section. This is usually temporary.'}
                        </p>
                        <button
                            onClick={this.handleRetry}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-sm font-bold hover:bg-cyan-500/30 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Retry
                        </button>
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <pre className="mt-4 text-left text-[10px] text-rose-300/60 bg-black/30 p-2 rounded overflow-auto max-h-32">
                                {this.state.error.message}
                            </pre>
                        )}
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
