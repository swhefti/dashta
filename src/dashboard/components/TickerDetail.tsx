'use client';

import { useEffect, useState } from 'react';
import { useTickerHistory } from '../lib/hooks';

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
  const accentColor = ASSET_COLORS[data.asset_class] ?? 'var(--accent-stock)';
  const { history } = useTickerHistory(data.ticker, horizon, mode);
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

          {/* Two-column summary: drift on the left, chips + stacked composites on the right */}
          <div
            className="px-6 py-4 grid gap-5 items-stretch"
            style={{ gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex flex-col">
              <DriftMap history={history} accent={accentColor} />
            </div>

            <div className="flex flex-col justify-between gap-3 min-w-0">
              {/* Price block — prominent */}
              <div>
                <div className="text-[9px] uppercase tracking-[0.18em] mb-0.5"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  Price
                </div>
                <div className="text-[26px] font-semibold leading-none tracking-tight"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {data.current_price != null ? `$${Number(data.current_price).toFixed(2)}` : '—'}
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[10px]"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  <span>{formatCap(data.market_cap)}</span>
                  <span style={{ color: 'var(--border-subtle)' }}>·</span>
                  <span className="flex items-center gap-1" style={{ color: confColor }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: confColor }} />
                    {Math.round(Number(data.confidence ?? 0))} {data.confidence_label ?? 'low'}
                  </span>
                </div>
              </div>

              {/* Fundamentals — compact 2-col stat grid */}
              <FundamentalGrid data={data} />

              {/* Composite scores — stacked vertically */}
              <div className="flex flex-col gap-3">
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
          </div>

          {/* Explanation — full width */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {data.explanation ? (
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-primary)', lineHeight: '1.7' }}>
                {data.explanation}
              </p>
            ) : (
              <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                Explanation will be generated on the next scoring run.
              </p>
            )}
          </div>

          {/* Factor breakdown — two-column grid */}
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-0">
              <div>
                <h4 className="text-[9px] font-medium uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--text-muted)' }}>Risk Factors</h4>
                <div className="space-y-1.5">
                  <FactorRow label="Volatility" value={data.volatility_score} />
                  <FactorRow label="Drawdown" value={data.max_drawdown_score} />
                  <FactorRow label="Beta" value={data.beta_score} />
                  <FactorRow label="Liquidity" value={data.liquidity_risk_score} />
                  <FactorRow label="Fragility" value={data.fundamental_fragility_score} />
                </div>
              </div>
              <div>
                <h4 className="text-[9px] font-medium uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--text-muted)' }}>Upward Factors</h4>
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

function CompositeScore({ label, value, color, barClass }: { label: string; value: number; color: string; barClass: string }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[10px] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {label}
        </span>
        <span className="text-2xl font-semibold leading-none" style={{ fontFamily: 'var(--font-mono)', color }}>
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
