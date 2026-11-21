import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(readable);
      if (parsed && typeof parsed.error === 'string') {
        readable = `${parsed.error}${parsed.path ? ` (${parsed.path})` : ''}`;
      }
    } catch {
      // Plain text error
    }
    return { hasError: true, message: readable };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070B13] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-lg border border-red-900/70 bg-[#0B111E] p-6 space-y-4">
            <p className="font-mono-tabular text-xs uppercase tracking-widest text-red-400">
              System Safeguard
            </p>
            <h1 className="font-display text-2xl font-semibold text-white">
              Something interrupted this session
            </h1>
            <p className="text-sm text-slate-300 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
            >
              Reload Platform
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
