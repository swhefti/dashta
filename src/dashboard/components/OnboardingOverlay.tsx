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

// Two text sizes, three colors — everything below maps onto this palette
// on purpose, so adding more copy doesn't turn into visual noise.
const BODY = { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 } as const;
const LABEL = { fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' } as const;
const META = { fontSize: 10, color: 'var(--text-muted)' } as const;

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
            <p className="italic mb-2" style={META}>Every asset, on the radar.</p>
            <p style={BODY}>
              Each bubble is a stock, ETF, or crypto asset — 130+ tracked, refreshed daily.
              Switch the outlook with 3mo / 6mo / 12mo, or toggle Relative vs. Absolute
              scoring, in the header.
            </p>
          </div>

          <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="grid gap-y-1" style={{ gridTemplateColumns: '52px 1fr' }}>
              {LEGEND.map(({ label, desc }) => (
                <div key={label} className="contents">
                  <span style={{ ...LABEL, fontFamily: 'var(--font-mono)' }}>{label}</span>
                  <span style={BODY}>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <p style={BODY}>
              Scroll to zoom, drag to pan, search or filter by asset class in the header,
              and click any bubble for its full breakdown plus AI deep analysis. The
              collapsed panel on the right holds a daily brief — expand it for today's
              biggest movers.
            </p>
          </div>

          <div className="px-5 pb-2">
            <p style={META}>Informational only. Not financial advice.</p>
          </div>

          <div className="px-5 pb-4 pt-2 flex items-center justify-between">
            <button
              onClick={onDontShowAgain}
              style={{ ...META, fontFamily: 'var(--font-mono)' }}
            >
              Don't show again
            </button>
            <button
              onClick={onGotIt}
              className="px-4 py-1.5 rounded font-medium"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#06080d', background: 'var(--accent-stock)' }}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
