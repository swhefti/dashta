'use client';

import { useEffect } from 'react';

interface OnboardingOverlayProps {
  onGotIt: () => void;
  onDontShowAgain: () => void;
}

export function OnboardingOverlay({ onGotIt, onDontShowAgain }: OnboardingOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onGotIt();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onGotIt]);

  return (
    <>
      {/* Backdrop — the bubble chart's entrance animation plays behind this,
          already settled by the time a visitor gets around to dismissing. */}
      <div
        className="fixed inset-0 z-[100]"
        style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onGotIt}
      />

      <div className="fixed inset-0 z-[110] flex items-center justify-center px-4 pointer-events-none">
        <div
          className="glass-strong rounded-lg shadow-2xl w-full max-w-[440px] pointer-events-auto"
          style={{ animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 pt-5 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2.5">
              <span
                className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                style={{ background: 'var(--accent-stock)', boxShadow: '0 0 10px var(--accent-stock)' }}
              />
              <h2
                className="text-sm font-semibold tracking-tight"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}
              >
                Risk × Upward Probability Radar
              </h2>
            </div>
          </div>

          <div className="px-6 py-4 space-y-4">
            <div>
              <div
                className="text-[10px] font-medium tracking-[0.1em] uppercase mb-1.5"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
              >
                What you're looking at
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Each bubble is a stock, ETF, or crypto asset.{' '}
                <span style={{ color: 'var(--text-primary)' }}>X-axis</span> is risk score,{' '}
                <span style={{ color: 'var(--text-primary)' }}>Y-axis</span> is upward probability,{' '}
                <span style={{ color: 'var(--text-primary)' }}>size</span> is market cap, and{' '}
                <span style={{ color: 'var(--text-primary)' }}>color</span> marks the asset class.
              </p>
            </div>

            <div>
              <div
                className="text-[10px] font-medium tracking-[0.1em] uppercase mb-1.5"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
              >
                How to explore
              </div>
              <ul className="text-[12px] leading-relaxed space-y-1" style={{ color: 'var(--text-secondary)' }}>
                <li>Scroll to zoom, drag to pan around dense clusters</li>
                <li>Click a bubble for the full score breakdown and AI deep analysis</li>
                <li>Use search, the asset-class filter, or the horizon selector in the header to narrow the view</li>
              </ul>
            </div>

            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              Scores are for informational purposes only. Not financial advice. Past performance does not guarantee future results.
            </p>
          </div>

          <div className="px-6 pb-5 flex items-center justify-end gap-2">
            <button
              onClick={onDontShowAgain}
              className="text-[11px] px-3 py-1.5 rounded"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
            >
              Don't show again
            </button>
            <button
              onClick={onGotIt}
              className="text-[11px] px-4 py-1.5 rounded font-medium"
              style={{ fontFamily: 'var(--font-mono)', color: '#06080d', background: 'var(--accent-stock)' }}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
