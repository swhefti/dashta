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

          {/* Score history sparkline */}
          {history.length > 1 && (
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <MiniHistory history={history} />
            </div>
          )}

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

function MiniHistory({ history }: { history: any[] }) {
  const riskPts = history.map((h: any, i: number) => `${(i / (history.length - 1)) * 100},${100 - Number(h.risk_score)}`).join(' ');
  const upPts = history.map((h: any, i: number) => `${(i / (history.length - 1)) * 100},${100 - Number(h.upward_probability_score)}`).join(' ');

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>History ({history.length}d)</span>
        <div className="flex gap-3">
          <span className="text-[9px]" style={{ color: 'var(--accent-danger)' }}>risk</span>
          <span className="text-[9px]" style={{ color: 'var(--accent-etf)' }}>upward</span>
        </div>
      </div>
      <svg viewBox="0 0 100 100" className="w-full h-12" preserveAspectRatio="none">
        <polyline points={riskPts} fill="none" stroke="var(--accent-danger)" strokeWidth="1.5" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
        <polyline points={upPts} fill="none" stroke="var(--accent-etf)" strokeWidth="1.5" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
