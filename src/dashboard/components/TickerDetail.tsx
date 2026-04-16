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
          className="glass-strong rounded-xl shadow-2xl w-full max-w-[560px] max-h-[85vh] overflow-y-auto pointer-events-auto"
          style={{
            transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(12px)',
            opacity: visible ? 1 : 0,
            transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease',
          }}
        >
          {/* Header */}
          <div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
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

            {/* Metrics row */}
            <div className="flex gap-3 mt-4">
              <Chip label="Price" value={data.current_price != null ? `$${Number(data.current_price).toFixed(2)}` : '--'} />
              <Chip label="Mkt Cap" value={formatCap(data.market_cap)} />
              <Chip label="Confidence">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: confColor }} />
                  <span className="text-[13px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: confColor }}>
                    {Math.round(Number(data.confidence ?? 0))}
                  </span>
                  <span className="text-[9px] uppercase" style={{ color: confColor }}>{data.confidence_label ?? 'low'}</span>
                </div>
              </Chip>
            </div>
          </div>

          {/* Composite scores — compact inline */}
          <div className="px-6 py-4 flex gap-6" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="flex-1">
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Risk</span>
                <span className="text-lg font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-danger)' }}>
                  {Number(data.risk_score).toFixed(1)}
                </span>
              </div>
              <div className="w-full h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="bar-risk h-full rounded-full" style={{ width: `${data.risk_score}%` }} />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Upward</span>
                <span className="text-lg font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-etf)' }}>
                  {Number(data.upward_probability_score).toFixed(1)}
                </span>
              </div>
              <div className="w-full h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="bar-upward h-full rounded-full" style={{ width: `${data.upward_probability_score}%` }} />
              </div>
            </div>
          </div>

          {/* Explanation — the hero content */}
          <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
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

          {/* Recent score drift — local movement around the current point */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <DriftMap
              history={history}
              current={{
                risk: Number(data.risk_score),
                upward: Number(data.upward_probability_score),
              }}
              accent={accentColor}
            />
          </div>

          {/* Factor breakdown — two-column grid */}
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-0">
              <div>
                <h4 className="text-[9px] font-medium uppercase tracking-[0.15em] mb-2.5" style={{ color: 'var(--text-muted)' }}>Risk Factors</h4>
                <div className="space-y-2">
                  <FactorRow label="Volatility" value={data.volatility_score} />
                  <FactorRow label="Drawdown" value={data.max_drawdown_score} />
                  <FactorRow label="Beta" value={data.beta_score} />
                  <FactorRow label="Liquidity" value={data.liquidity_risk_score} />
                  <FactorRow label="Fragility" value={data.fundamental_fragility_score} />
                </div>
              </div>
              <div>
                <h4 className="text-[9px] font-medium uppercase tracking-[0.15em] mb-2.5" style={{ color: 'var(--text-muted)' }}>Upward Factors</h4>
                <div className="space-y-2">
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
          <div className="px-6 pb-4">
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
    <div className="flex-1 rounded-md px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{label}</div>
      {children ?? (
        <div className="text-[13px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{value}</div>
      )}
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
  current,
  accent,
}: {
  history: HistoryRow[];
  current: { risk: number; upward: number };
  accent: string;
}) {
  const recent = dedupeByDate(history ?? []).slice(-7);
  // Deltas: x = prior_risk - current_risk, y = prior_upward - current_upward
  const deltas = recent.map((p) => ({
    dx: Number(p.risk_score) - current.risk,
    dy: Number(p.upward_probability_score) - current.upward,
    date: p.score_date,
  }));

  // Force last point to be exactly the anchor (guard against float drift)
  if (deltas.length > 0) {
    deltas[deltas.length - 1] = { ...deltas[deltas.length - 1], dx: 0, dy: 0 };
  }

  const maxAbs = deltas.reduce(
    (m, d) => Math.max(m, Math.abs(d.dx), Math.abs(d.dy)),
    0
  );
  const range = Math.min(
    MAX_DRIFT_RANGE,
    Math.max(MIN_DRIFT_RANGE, maxAbs * DRIFT_PADDING)
  );

  // SVG 100×100, center (50,50), inner working area 42 units each side
  const VB = 100;
  const C = VB / 2;
  const RADIUS = 42;
  const toSvg = (dx: number, dy: number) => ({
    x: C + (dx / range) * RADIUS,
    y: C - (dy / range) * RADIUS, // invert — upward improvement rises
  });
  const mapped = deltas.map((d) => ({ ...toSvg(d.dx, d.dy), date: d.date }));
  const hasPath = mapped.length >= 2;

  // Faint inner grid step at 50% of the range
  const innerStep = RADIUS / 2;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
          Recent Score Drift
        </span>
        <span className="text-[9px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {recent.length} {recent.length === 1 ? 'run' : 'runs'}
        </span>
      </div>

      {mapped.length < 2 ? (
        <div className="h-[160px] flex items-center justify-center rounded-lg"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Need more history to show drift.
          </span>
        </div>
      ) : (
        <div className="rounded-lg p-2"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-subtle)' }}>
          <svg viewBox={`0 0 ${VB} ${VB}`} className="w-full" style={{ aspectRatio: '1 / 1', display: 'block' }}>
            {/* Outer frame */}
            <rect x={C - RADIUS} y={C - RADIUS} width={RADIUS * 2} height={RADIUS * 2}
              fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.35" />

            {/* Faint inner ring at 50% of the range */}
            <rect
              x={C - innerStep} y={C - innerStep}
              width={innerStep * 2} height={innerStep * 2}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="0.3"
              strokeDasharray="1 2"
            />

            {/* Central crosshair axes */}
            <line x1={C - RADIUS} y1={C} x2={C + RADIUS} y2={C}
              stroke="rgba(255,255,255,0.12)" strokeWidth="0.35" />
            <line x1={C} y1={C - RADIUS} x2={C} y2={C + RADIUS}
              stroke="rgba(255,255,255,0.12)" strokeWidth="0.35" />

            {/* Edge labels — extremely quiet */}
            <text x={C - RADIUS + 0.5} y={C - 1.5} fontSize="2.6"
              fill="rgba(255,255,255,0.28)"
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              − risk
            </text>
            <text x={C + RADIUS - 0.5} y={C - 1.5} fontSize="2.6"
              textAnchor="end"
              fill="rgba(255,255,255,0.28)"
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              + risk
            </text>
            <text x={C + 1.5} y={C - RADIUS + 2.8} fontSize="2.6"
              fill="rgba(255,255,255,0.28)"
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              + upward
            </text>
            <text x={C + 1.5} y={C + RADIUS - 0.5} fontSize="2.6"
              fill="rgba(255,255,255,0.28)"
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              − upward
            </text>

            {/* Path — thin, with fading opacity on older segments */}
            {hasPath && mapped.slice(1).map((pt, i) => {
              const prev = mapped[i];
              const frac = (i + 1) / (mapped.length - 1);
              const opacity = 0.18 + frac * 0.45;
              return (
                <line
                  key={`seg-${i}`}
                  x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y}
                  stroke={accent}
                  strokeOpacity={opacity}
                  strokeWidth="0.7"
                  strokeLinecap="round"
                />
              );
            })}

            {/* Prior points — small and soft */}
            {mapped.map((pt, i) => {
              const isLast = i === mapped.length - 1;
              if (isLast) return null;
              const isFirst = i === 0;
              const frac = mapped.length > 1 ? i / (mapped.length - 1) : 1;
              const r = isFirst ? 0.9 : 0.7 + frac * 0.45;
              const opacity = isFirst ? 0.5 : 0.28 + frac * 0.45;
              if (isFirst) {
                return (
                  <circle key={`pt-${i}`} cx={pt.x} cy={pt.y} r={r}
                    fill="none" stroke={accent} strokeWidth="0.4" strokeOpacity={opacity} />
                );
              }
              return (
                <circle key={`pt-${i}`} cx={pt.x} cy={pt.y} r={r}
                  fill={accent} opacity={opacity} />
              );
            })}

            {/* Current point — anchor at center, modestly emphasized */}
            {mapped.length > 0 && (() => {
              const pt = mapped[mapped.length - 1];
              return (
                <g>
                  <circle cx={pt.x} cy={pt.y} r="2.3" fill={accent} opacity="0.12" />
                  <circle cx={pt.x} cy={pt.y} r="1.25" fill={accent} />
                </g>
              );
            })()}
          </svg>
        </div>
      )}
    </div>
  );
}
