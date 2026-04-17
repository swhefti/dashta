'use client';

import { useState, useRef, useCallback } from 'react';
import type { PricePoint } from '../lib/hooks';

const RANGES = ['7d', '30d', '3m'] as const;

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function fmtDate(d: string, range: string): string {
  const dt = new Date(d + 'T00:00:00');
  if (range === '7d') return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface PriceChartProps {
  prices: PricePoint[];
  isLoading: boolean;
  range: string;
  onRangeChange: (r: string) => void;
  accent: string;
}

export function PriceChart({ prices, isLoading, range, onRangeChange, accent }: PriceChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 600;
  const H = 140;
  const PX = 0;
  const PY = 8;

  const closes = prices.map((p) => p.close);
  const min = closes.length > 0 ? Math.min(...closes) : 0;
  const max = closes.length > 0 ? Math.max(...closes) : 1;
  const spread = max - min || 1;

  const toX = useCallback((i: number) => PX + (i / Math.max(1, closes.length - 1)) * (W - 2 * PX), [closes.length]);
  const toY = useCallback((v: number) => PY + (1 - (v - min) / spread) * (H - 2 * PY), [min, spread]);

  const pathD = closes.map((c, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(c).toFixed(1)}`).join(' ');
  const areaD = pathD + ` L${toX(closes.length - 1).toFixed(1)},${H} L${toX(0).toFixed(1)},${H} Z`;

  const first = closes[0] ?? 0;
  const last = closes[closes.length - 1] ?? 0;
  const change = last - first;
  const changePct = first !== 0 ? (change / first) * 100 : 0;
  const isPositive = change >= 0;
  const lineColor = accent;

  const hovered = hoverIdx != null ? prices[hoverIdx] : null;

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || closes.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = x / rect.width;
    const idx = Math.round(frac * (closes.length - 1));
    setHoverIdx(Math.max(0, Math.min(closes.length - 1, idx)));
  }, [closes.length]);

  return (
    <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Header row: price info + range toggles */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] uppercase tracking-[0.18em]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            Price
          </span>
          {hovered ? (
            <span className="text-[11px] tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              ${fmtPrice(hovered.close)}
              <span className="ml-1.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>{fmtDate(hovered.date, range)}</span>
            </span>
          ) : closes.length > 0 ? (
            <span className="text-[11px] tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              ${fmtPrice(last)}
              <span className="ml-1.5 text-[9px]"
                style={{ color: isPositive ? 'var(--accent-etf)' : 'var(--accent-danger)' }}>
                {isPositive ? '+' : ''}{fmtPrice(change)} ({isPositive ? '+' : ''}{changePct.toFixed(1)}%)
              </span>
            </span>
          ) : null}
        </div>

        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className="text-[9px] uppercase px-1.5 py-0.5 rounded transition-colors"
              style={{
                fontFamily: 'var(--font-mono)',
                color: range === r ? 'var(--text-primary)' : 'var(--text-muted)',
                background: range === r ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: range === r ? '1px solid var(--border-subtle)' : '1px solid transparent',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height: 100 }}>
          <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>Loading…</span>
        </div>
      ) : closes.length < 2 ? (
        <div className="flex items-center justify-center rounded-md" style={{ height: 100, background: 'rgba(255,255,255,0.02)' }}>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No price history available.</span>
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 100, display: 'block' }}
          preserveAspectRatio="none"
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Gradient fill */}
          <defs>
            <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.12" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Area */}
          <path d={areaD} fill="url(#price-fill)" />

          {/* Line */}
          <path d={pathD} fill="none" stroke={lineColor} strokeWidth="1.5" strokeOpacity="0.8"
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />

          {/* Hover crosshair + dot */}
          {hoverIdx != null && (
            <>
              <line
                x1={toX(hoverIdx)} y1={0} x2={toX(hoverIdx)} y2={H}
                stroke="rgba(255,255,255,0.15)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <circle
                cx={toX(hoverIdx)} cy={toY(closes[hoverIdx])}
                r="3" fill={lineColor} stroke="rgba(255,255,255,0.7)" strokeWidth="1"
                vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
      )}
    </div>
  );
}
