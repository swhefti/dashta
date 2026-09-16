'use client';

import { useEffect } from 'react';
import { Logo } from './Logo';

interface OnboardingOverlayProps {
  onGotIt: () => void;
  onDontShowAgain: () => void;
}

const LEGEND: { label: string; desc: string }[] = [
  { label: 'X', desc: 'risk' },
  { label: 'Y', desc: 'upward probability' },
  { label: 'size', desc: 'market cap' },
  { label: 'color', desc: 'asset class' },
];

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
      {/* Backdrop — the bubble chart's entrance animation is timed to finish
          well before this ever mounts, so dismissing always reveals an
          already-settled chart. */}
      <div
        className="fixed inset-0 z-[100]"
        style={{ background: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(3px)' }}
        onClick={onGotIt}
      />

      <div className="fixed inset-0 z-[110] flex items-center justify-center px-4 pointer-events-none">
        <div
          className="glass-strong rounded-lg shadow-2xl w-full max-w-[400px] pointer-events-auto"
          style={{ animation: 'fadeInUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 pt-5">
            <h2 className="mb-2.5"><Logo size="lg" /></h2>
            <p className="text-[11px] italic mb-2" style={{ color: 'var(--text-muted)' }}>
              Every asset, on the radar.
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Each bubble is a stock, ETF, or crypto asset.
            </p>
          </div>

          <div className="px-5 py-3.5 flex flex-wrap gap-x-3 gap-y-1">
            {LEGEND.map(({ label, desc }) => (
              <span key={label} className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--text-primary)' }}>{label}</span> {desc}
              </span>
            ))}
          </div>

          <div className="px-5 py-3 space-y-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Scroll to zoom, drag to pan, click a bubble for the full breakdown and AI deep analysis.
            </p>
          </div>

          <div className="px-5 pb-2">
            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              Informational only. Not financial advice.
            </p>
          </div>

          <div className="px-5 pb-4 pt-2 flex items-center justify-between">
            <button
              onClick={onDontShowAgain}
              className="text-[10px]"
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
