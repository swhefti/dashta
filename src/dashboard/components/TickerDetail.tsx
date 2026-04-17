'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useTickerHistory, usePriceHistory } from '../lib/hooks';
import { PriceChart } from './PriceChart';

// ── Factor explanation data & weights ──

type FactorInfo = {
  name: string;
  means: string;
  effect: string;
};

const RISK_FACTORS: FactorInfo[] = [
  { name: 'Volatility', means: 'How much the price tends to swing day-to-day.', effect: 'Higher volatility pushes the risk score up.' },
  { name: 'Drawdown', means: 'The worst peak-to-trough decline in the lookback window.', effect: 'Deeper drawdowns push the risk score up.' },
  { name: 'Beta', means: 'How sensitive the price is to broad market moves.', effect: 'Higher beta means more market exposure, pushing risk up.' },
  { name: 'Liquidity', means: 'How easily shares can be traded without moving the price.', effect: 'Lower liquidity pushes the risk score up.' },
  { name: 'Fragility', means: 'Financial health based on debt levels and coverage ratios.', effect: 'Weaker balance sheets push the risk score up.' },
];

const UPWARD_FACTORS: FactorInfo[] = [
  { name: 'Momentum', means: 'The strength and direction of the current price trend.', effect: 'Stronger positive trend pushes the upward score higher.' },
  { name: 'Reversion', means: 'Whether the price is stretched relative to its recent range (RSI).', effect: 'Oversold conditions push the upward score higher.' },
  { name: 'Value', means: 'How attractively priced the asset is on fundamentals (P/E, PEG, earnings growth).', effect: 'Cheaper valuations push the upward score higher.' },
  { name: 'Sentiment', means: 'The tone of recent news coverage for this ticker.', effect: 'More positive sentiment pushes the upward score higher.' },
  { name: 'Regime', means: 'Whether the current macro environment favors this asset class.', effect: 'Favorable macro regime pushes the upward score higher.' },
  { name: 'Seasonal', means: 'How often this asset has risen over the same calendar period historically.', effect: 'Higher historical win rate pushes the upward score higher.' },
];

// Weights from db/migrations/002_seed_weights.sql — indexed by horizon
const RISK_WEIGHTS: Record<number, Record<string, number>> = {
  3:  { Volatility: 30, Drawdown: 25, Beta: 15, Liquidity: 15, Fragility: 15 },
  6:  { Volatility: 28, Drawdown: 22, Beta: 15, Liquidity: 15, Fragility: 20 },
  12: { Volatility: 25, Drawdown: 20, Beta: 15, Liquidity: 15, Fragility: 25 },
};

const UPWARD_WEIGHTS: Record<number, Record<string, number>> = {
  3:  { Momentum: 25, Reversion: 15, Value: 20, Sentiment: 20, Regime: 10, Seasonal: 10 },
  6:  { Momentum: 20, Reversion: 12, Value: 25, Sentiment: 20, Regime: 10, Seasonal: 13 },
  12: { Momentum: 15, Reversion: 10, Value: 30, Sentiment: 20, Regime: 10, Seasonal: 15 },
};

interface TickerDetailProps {
  data: any;
  horizon: number;
  mode: string;
  onClose: () => void;
}

const ASSET_COLORS: Record<string, string> = {
  stock: 'var(--accent-stock)',
  etf: 'var(--accent-etf)',
  crypto: 'var(--accent-crypto)',
};

const CONF_COLORS: Record<string, string> = {
  high: 'var(--accent-etf)',
  medium: 'var(--accent-crypto)',
  low: 'var(--accent-danger)',
};

function formatCap(cap: number | null): string {
  if (!cap) return '--';
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toLocaleString()}`;
}

export function TickerDetail({ data, horizon, mode, onClose }: TickerDetailProps) {
  const [visible, setVisible] = useState(false);
  const [infoPanel, setInfoPanel] = useState<'risk' | 'upward' | null>(null);
  const [priceRange, setPriceRange] = useState('30d');
  const accentColor = ASSET_COLORS[data.asset_class] ?? 'var(--accent-stock)';
  const { history } = useTickerHistory(data.ticker, horizon, mode);
  const { prices, isLoading: pricesLoading } = usePriceHistory(data.ticker, priceRange);
  const confColor = CONF_COLORS[data.confidence_label] ?? CONF_COLORS.low;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 transition-opacity duration-300"
        style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Centered modal */}
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="glass-strong rounded-xl shadow-2xl w-full max-w-[680px] max-h-[88vh] overflow-y-auto pointer-events-auto"
          style={{
            transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(12px)',
            opacity: visible ? 1 : 0,
            transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease',
          }}
        >
          {/* Header */}
          <div className="px-6 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="w-[7px] h-[7px] rounded-full"
                    style={{ background: accentColor, boxShadow: `0 0 10px ${accentColor}` }} />
                  <h2 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: 'var(--font-mono)' }}>
                    {data.ticker}
                  </h2>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{ color: 'var(--text-secondary)', background: 'var(--border-subtle)' }}>
                    {data.asset_class}
                  </span>
                </div>
                <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{data.company_name}</p>
              </div>
              <button onClick={handleClose}
                className="p-1.5 rounded-md transition-colors duration-150 hover:bg-white/5"
                style={{ color: 'var(--text-muted)' }}>
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Explanation — below header, above the grid */}
          {data.explanation && (
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)', lineHeight: '1.65' }}>
                {data.explanation}
              </p>
            </div>
          )}

          {/* Price chart */}
          <PriceChart
            prices={prices}
            isLoading={pricesLoading}
            range={priceRange}
            onRangeChange={setPriceRange}
            accent={accentColor}
          />

          {/* Two-column summary: drift on the left, chips + stacked composites on the right */}
          <div
            className="px-6 py-4 grid gap-5 items-stretch"
            style={{ gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex flex-col">
              <DriftMap history={history} accent={accentColor} />
            </div>

            <div className="flex flex-col justify-between gap-3 min-w-0">
              {/* Top group: Price + Mkt Cap → Risk/Upward */}
              <div className="flex flex-col gap-3">
                {/* Price + Mkt Cap side by side */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.18em] mb-0.5"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      Price
                    </div>
                    <div className="text-[24px] font-semibold leading-none tracking-tight"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {data.current_price != null ? `$${Number(data.current_price).toFixed(2)}` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.18em] mb-0.5"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      Mkt Cap
                    </div>
                    <div className="text-[18px] font-semibold leading-none tracking-tight"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {formatCap(data.market_cap)}
                    </div>
                  </div>
                </div>

                {/* Composite scores */}
                <div className="flex flex-col gap-2.5">
                  <CompositeScore
                    label="Risk"
                    value={Number(data.risk_score)}
                    color="var(--accent-danger)"
                    barClass="bar-risk"
                  />
                  <CompositeScore
                    label="Upward Probability"
                    value={Number(data.upward_probability_score)}
                    color="var(--accent-etf)"
                    barClass="bar-upward"
                  />
                </div>
              </div>

              {/* Fundamentals grid — pinned to bottom so it aligns with drift's bottom edge */}
              <FundamentalGrid data={data} />
            </div>
          </div>

          {/* Factor breakdown — two-column grid with overlay popover */}
          <div className="px-6 py-4 relative">
            <div className="grid grid-cols-2 gap-x-8 gap-y-0">
              <div>
                <FactorSectionHeader
                  title="Risk Factors"
                  isOpen={infoPanel === 'risk'}
                  onToggle={() => setInfoPanel((v) => v === 'risk' ? null : 'risk')}
                />
                <div className="space-y-1.5">
                  <FactorRow label="Volatility" value={data.volatility_score} />
                  <FactorRow label="Drawdown" value={data.max_drawdown_score} />
                  <FactorRow label="Beta" value={data.beta_score} />
                  <FactorRow label="Liquidity" value={data.liquidity_risk_score} />
                  <FactorRow label="Fragility" value={data.fundamental_fragility_score} />
                </div>
              </div>
              <div>
                <FactorSectionHeader
                  title="Upward Factors"
                  isOpen={infoPanel === 'upward'}
                  onToggle={() => setInfoPanel((v) => v === 'upward' ? null : 'upward')}
                />
                <div className="space-y-1.5">
                  <FactorRow label="Momentum" value={data.trend_momentum_score} />
                  <FactorRow label="Reversion" value={data.mean_reversion_score} />
                  <FactorRow label="Value" value={data.fundamental_value_score} />
                  <FactorRow label="Sentiment" value={data.sentiment_score} />
                  <FactorRow label="Regime" value={data.macro_regime_score} />
                  <FactorRow label="Seasonal" value={data.seasonal_score} />
                </div>
              </div>
            </div>

            {/* Popover overlay — covers the factor grid */}
            {infoPanel && (
              <FactorInfoPanel
                type={infoPanel}
                horizon={horizon}
                onClose={() => setInfoPanel(null)}
              />
            )}
          </div>

          {/* Disclaimer */}
          <div className="px-6 pb-3">
            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              Scores are for informational purposes only. Not financial advice. Past performance does not guarantee future results.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ──

function Chip({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md px-3 py-2 min-w-0" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
      <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{label}</div>
      {children ?? (
        <div className="text-[13px] font-medium truncate" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{value}</div>
      )}
    </div>
  );
}

function ChipRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between rounded-md px-3 py-2 min-w-0"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}
    >
      <span className="text-[10px] uppercase tracking-[0.14em]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
        {label}
      </span>
      {children ?? (
        <span className="text-[13px] font-medium truncate" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{value}</span>
      )}
    </div>
  );
}

function fmtRatio(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const pct = v * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`;
}

function StatCell({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const isMissing = value === '—';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-[0.14em]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span
        className="text-[13px] font-medium tabular-nums"
        style={{
          fontFamily: 'var(--font-mono)',
          color: isMissing ? 'var(--text-muted)' : valueColor ?? 'var(--text-primary)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function FundamentalGrid({ data }: { data: any }) {
  const f = data.fundamentals;
  const allMissing =
    !f ||
    [f.pe_ratio, f.ps_ratio, f.revenue_growth_yoy, f.profit_margin, f.roe, f.debt_to_equity]
      .every((v: any) => v == null);

  if (allMissing) {
    return (
      <div className="rounded-md px-3 py-3 text-[10px] italic"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
        No fundamentals available for this asset.
      </div>
    );
  }

  const growthColor =
    f.revenue_growth_yoy != null
      ? f.revenue_growth_yoy >= 0
        ? 'var(--accent-etf)'
        : 'var(--accent-danger)'
      : undefined;
  const marginColor =
    f.profit_margin != null
      ? f.profit_margin >= 0
        ? 'var(--accent-etf)'
        : 'var(--accent-danger)'
      : undefined;

  return (
    <div
      className="rounded-md px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-2"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}
    >
      <StatCell label="P/E" value={fmtRatio(f.pe_ratio)} />
      <StatCell label="Rev YoY" value={fmtPct(f.revenue_growth_yoy)} valueColor={growthColor} />
      <StatCell label="P/S" value={fmtRatio(f.ps_ratio)} />
      <StatCell label="Margin" value={fmtPct(f.profit_margin)} valueColor={marginColor} />
      <StatCell label="ROE" value={fmtPct(f.roe)} />
      <StatCell label="D/E" value={fmtRatio(f.debt_to_equity, 2)} />
    </div>
  );
}

function FactorSectionHeader({
  title,
  isOpen,
  onToggle,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h4 className="text-[9px] font-medium uppercase tracking-[0.15em]" style={{ color: 'var(--text-muted)' }}>
        {title}
      </h4>
      <button
        onClick={onToggle}
        className="p-0.5 rounded transition-colors hover:bg-white/[0.06]"
        style={{ color: isOpen ? 'var(--text-secondary)' : 'var(--text-muted)' }}
        aria-label={`What do ${title.toLowerCase()} mean?`}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M6.5 6.5a1.5 1.5 0 1 1 1.5 1.5V9.5" />
          <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </div>
  );
}

function FactorInfoPanel({
  type,
  horizon,
  onClose,
}: {
  type: 'risk' | 'upward';
  horizon: number;
  onClose: () => void;
}) {
  const isRisk = type === 'risk';
  const factors = isRisk ? RISK_FACTORS : UPWARD_FACTORS;
  const weights = isRisk
    ? (RISK_WEIGHTS[horizon] ?? RISK_WEIGHTS[3])
    : (UPWARD_WEIGHTS[horizon] ?? UPWARD_WEIGHTS[3]);
  const intro = isRisk
    ? 'These factors combine into the risk score. Higher values usually mean more downside or instability.'
    : 'These factors combine into the upward score. Higher values usually mean a stronger setup for upside.';
  const title = isRisk ? 'Risk Factors' : 'Upward Factors';

  return (
    <div className="absolute inset-0 z-10 rounded-md px-6 py-4 overflow-y-auto"
      style={{ background: 'rgba(14, 18, 28, 0.97)', backdropFilter: 'blur(8px)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-[9px] font-medium uppercase tracking-[0.15em]" style={{ color: 'var(--text-muted)' }}>
            {title} — Explained
          </h4>
          <span className="text-[9px] tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {horizon}mo weights
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded transition-colors hover:bg-white/[0.06]"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <p className="text-[10px] leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
        {intro}
      </p>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {factors.map((f) => (
          <div key={f.name}>
            <div className="flex items-baseline justify-between gap-2 mb-0.5">
              <span className="text-[11px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {f.name}
              </span>
              <span className="text-[9px] tabular-nums flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {weights[f.name] ?? '?'}%
              </span>
            </div>
            <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
              {f.means}
            </p>
            <p className="text-[10px] leading-snug mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {f.effect}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompositeScore({ label, value, color, barClass }: { label: string; value: number; color: string; barClass: string }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[10px] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {label}
        </span>
        <span className="text-[20px] font-semibold leading-none" style={{ fontFamily: 'var(--font-mono)', color }}>
          {value.toFixed(1)}
        </span>
      </div>
      <div className="w-full h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className={`${barClass} h-full rounded-full`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function FactorRow({ label, value }: { label: string; value?: number | null }) {
  const isNull = value == null;
  const v = isNull ? 0 : Number(value);
  return (
    <div className="flex items-center gap-2" style={{ opacity: isNull ? 0.35 : 1 }}>
      <span className="text-[10px] w-16 shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {!isNull && <div className="bar-neutral h-full rounded-full" style={{ width: `${v}%` }} />}
      </div>
      <span className="text-[10px] w-7 text-right" style={{ fontFamily: 'var(--font-mono)', color: isNull ? 'var(--text-muted)' : 'var(--text-primary)' }}>
        {isNull ? '--' : v.toFixed(0)}
      </span>
    </div>
  );
}

interface HistoryRow {
  score_date: string;
  risk_score: number | string;
  upward_probability_score: number | string;
}

function dedupeByDate(history: HistoryRow[]): HistoryRow[] {
  const map = new Map<string, HistoryRow>();
  for (const h of history) map.set(h.score_date, h);
  return [...map.values()].sort((a, b) => a.score_date < b.score_date ? -1 : 1);
}

const MIN_DRIFT_RANGE = 5;   // so tiny moves are still visible
const MAX_DRIFT_RANGE = 40;  // so one outlier doesn't dominate
const DRIFT_PADDING = 1.25;  // pad the tightest-fit range by 25%

function DriftMap({
  history,
  accent,
}: {
  history: HistoryRow[];
  accent: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const recent = dedupeByDate(history ?? []).slice(-10);

  // Older-middle anchor: floor((n-1)/2) → 10→4, 9→4, 5→2, 3→1, 2→0
  const anchorIdx = recent.length > 0 ? Math.floor((recent.length - 1) / 2) : 0;
  const anchor = recent[anchorIdx];

  // Deltas relative to the anchor
  const deltas = anchor
    ? recent.map((p, i) => ({
        dx: Number(p.risk_score) - Number(anchor.risk_score),
        dy: Number(p.upward_probability_score) - Number(anchor.upward_probability_score),
        date: p.score_date,
        isAnchor: i === anchorIdx,
        isLatest: i === recent.length - 1,
      }))
    : [];

  // Pin anchor exactly to (0,0) to avoid float drift
  if (deltas.length > 0) {
    deltas[anchorIdx] = { ...deltas[anchorIdx], dx: 0, dy: 0 };
  }

  const maxAbs = deltas.reduce((m, d) => Math.max(m, Math.abs(d.dx), Math.abs(d.dy)), 0);
  const range = Math.min(
    MAX_DRIFT_RANGE,
    Math.max(MIN_DRIFT_RANGE, maxAbs * DRIFT_PADDING)
  );

  const VB = 100;
  const C = VB / 2;
  const RADIUS = 49;
  const toSvg = (dx: number, dy: number) => ({
    x: C + (dx / range) * RADIUS,
    y: C - (dy / range) * RADIUS,
  });
  const mapped = deltas.map((d) => ({ ...toSvg(d.dx, d.dy), date: d.date, isAnchor: d.isAnchor, isLatest: d.isLatest }));
  const hasPath = mapped.length >= 2;
  const innerStep = RADIUS / 2;

  const hovered = hoverIdx != null ? mapped[hoverIdx] : null;
  const hoverLabel = hovered
    ? `${hovered.date}${hovered.isAnchor ? ' · anchor' : hovered.isLatest ? ' · latest' : ''}`
    : null;

  return (
    <>
      {mapped.length < 2 ? (
        <div className="aspect-square flex items-center justify-center rounded-lg"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
          <span className="text-[10px] text-center px-2" style={{ color: 'var(--text-muted)' }}>
            Need more history to show drift.
          </span>
        </div>
      ) : (
        <div className="rounded-lg relative overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-subtle)' }}>
          <svg viewBox={`0 0 ${VB} ${VB}`} className="w-full" style={{ aspectRatio: '1 / 1', display: 'block' }}>
            {/* Outer frame */}
            <rect x={C - RADIUS} y={C - RADIUS} width={RADIUS * 2} height={RADIUS * 2}
              fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.35" />

            {/* Inner ring at 50% of range */}
            <rect x={C - innerStep} y={C - innerStep}
              width={innerStep * 2} height={innerStep * 2}
              fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.3"
              strokeDasharray="1 2" />

            {/* Central crosshair */}
            <line x1={C - RADIUS} y1={C} x2={C + RADIUS} y2={C}
              stroke="rgba(255,255,255,0.12)" strokeWidth="0.35" />
            <line x1={C} y1={C - RADIUS} x2={C} y2={C + RADIUS}
              stroke="rgba(255,255,255,0.12)" strokeWidth="0.35" />

            {/* Edge labels */}
            <text x={C - RADIUS + 0.5} y={C - 1.5} fontSize="2.6"
              fill="rgba(255,255,255,0.28)" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>− risk</text>
            <text x={C + RADIUS - 0.5} y={C - 1.5} fontSize="2.6" textAnchor="end"
              fill="rgba(255,255,255,0.28)" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>+ risk</text>
            <text x={C + 1.5} y={C - RADIUS + 2.8} fontSize="2.6"
              fill="rgba(255,255,255,0.28)" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>+ upward</text>
            <text x={C + 1.5} y={C + RADIUS - 0.5} fontSize="2.6"
              fill="rgba(255,255,255,0.28)" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>− upward</text>

            {/* Path segments */}
            {hasPath && mapped.slice(1).map((pt, i) => {
              const prev = mapped[i];
              const frac = (i + 1) / (mapped.length - 1);
              const opacity = 0.18 + frac * 0.45;
              return (
                <line key={`seg-${i}`}
                  x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y}
                  stroke={accent} strokeOpacity={opacity} strokeWidth="0.7" strokeLinecap="round" />
              );
            })}

            {/* Points */}
            {mapped.map((pt, i) => {
              const frac = mapped.length > 1 ? i / (mapped.length - 1) : 1;
              const baseR = 0.7 + frac * 0.45;
              const baseOpacity = 0.3 + frac * 0.45;

              if (pt.isAnchor) {
                return (
                  <g key={`pt-${i}`}>
                    <circle cx={pt.x} cy={pt.y} r="1.4"
                      fill="none" stroke={accent} strokeWidth="0.55" strokeOpacity="0.7" />
                    <circle cx={pt.x} cy={pt.y} r="0.45" fill={accent} opacity="0.7" />
                  </g>
                );
              }
              if (pt.isLatest) {
                return (
                  <g key={`pt-${i}`}>
                    <circle cx={pt.x} cy={pt.y} r="2.1" fill={accent} opacity="0.12" />
                    <circle cx={pt.x} cy={pt.y} r="1.15" fill={accent} />
                  </g>
                );
              }
              return (
                <circle key={`pt-${i}`} cx={pt.x} cy={pt.y} r={baseR}
                  fill={accent} opacity={baseOpacity} />
              );
            })}

            {/* Hover hit-targets — slightly larger transparent circles */}
            {mapped.map((pt, i) => (
              <circle
                key={`hit-${i}`}
                cx={pt.x} cy={pt.y} r="4.5"
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
              />
            ))}

            {/* Hover ring on the active point */}
            {hovered && (
              <circle cx={hovered.x} cy={hovered.y} r="2.6"
                fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" />
            )}
          </svg>

          {/* Tooltip — anchored next to the hovered dot */}
          {hovered && hoverLabel && (
            <div
              className="absolute pointer-events-none px-1.5 py-0.5 rounded"
              style={{
                left: `${hovered.x}%`,
                top: `${hovered.y}%`,
                transform:
                  hovered.x > 65
                    ? 'translate(calc(-100% - 8px), -50%)'
                    : 'translate(8px, -50%)',
                background: 'rgba(0,0,0,0.78)',
                border: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--text-secondary)',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                zIndex: 2,
              }}
            >
              {hoverLabel}
            </div>
          )}
        </div>
      )}
    </>
  );
}
