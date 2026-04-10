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

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  // Count available factors
  const factorFields = [
    'volatility_score', 'max_drawdown_score', 'beta_score', 'liquidity_risk_score',
    'fundamental_fragility_score', 'trend_momentum_score', 'mean_reversion_score',
    'fundamental_value_score', 'sentiment_score', 'macro_regime_score', 'seasonal_score',
  ];
  const availCount = factorFields.filter((f) => data[f] != null).length;

  return (
    <>
      <div
        className="fixed inset-0 z-30 transition-opacity duration-300"
        style={{ background: 'rgba(0,0,0,0.4)', opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      <div
        className="fixed right-0 top-0 h-full w-[380px] z-40 glass-strong overflow-y-auto transition-panel"
        style={{
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          opacity: visible ? 1 : 0,
          borderLeft: '1px solid var(--border-medium)',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-5 pt-5 pb-4"
          style={{ background: 'rgba(12, 16, 24, 0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-[6px] h-[6px] rounded-full"
                  style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />
                <h2 className="text-xl font-semibold tracking-tight"
                  style={{ fontFamily: 'var(--font-mono)' }}>
                  {data.ticker}
                </h2>
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ color: 'var(--text-secondary)', background: 'var(--border-subtle)' }}>
                  {data.asset_class}
                </span>
              </div>
              <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                {data.company_name}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-1 rounded transition-colors duration-150 hover:bg-white/5"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex gap-3 mt-3">
            <MetricChip label="Price" value={data.current_price != null ? `$${Number(data.current_price).toFixed(2)}` : '--'} />
            <MetricChip label="Mkt Cap" value={formatCap(data.market_cap)} />
            <ConfidenceBadge score={data.confidence} label={data.confidence_label} />
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Composite scores */}
          <Section title="Composite Scores">
            <ScoreBar label="Risk Score" value={data.risk_score} barClass="bar-risk" />
            <ScoreBar label="Upward Probability" value={data.upward_probability_score} barClass="bar-upward" />
          </Section>

          {/* Score history */}
          {history.length > 1 && (
            <Section title={`Score History (${history.length}d)`}>
              <MiniHistory history={history} />
            </Section>
          )}
          {history.length <= 1 && (
            <Section title="Score History">
              <div className="text-[11px] py-2" style={{ color: 'var(--text-muted)' }}>
                Not enough historical runs to show trends. Score history builds over time as daily runs accumulate.
              </div>
            </Section>
          )}

          {/* Risk breakdown */}
          <Section title="Risk Breakdown">
            <ScoreBar label="Volatility" value={data.volatility_score} />
            <ScoreBar label="Max Drawdown" value={data.max_drawdown_score} />
            <ScoreBar label="Beta" value={data.beta_score} />
            <ScoreBar label="Liquidity Risk" value={data.liquidity_risk_score} />
            <ScoreBar label="Fund. Fragility" value={data.fundamental_fragility_score} />
          </Section>

          {/* Upward breakdown */}
          <Section title="Upward Breakdown">
            <ScoreBar label="Trend Momentum" value={data.trend_momentum_score} />
            <ScoreBar label="Mean Reversion" value={data.mean_reversion_score} />
            <ScoreBar label="Fund. Value" value={data.fundamental_value_score} />
            <ScoreBar label="Sentiment" value={data.sentiment_score} />
            <ScoreBar label="Macro Regime" value={data.macro_regime_score} />
            <ScoreBar label="Seasonal" value={data.seasonal_score} />
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-medium uppercase tracking-[0.15em] mb-3"
        style={{ color: 'var(--text-muted)' }}>
        {title}
      </h3>
      <div className="space-y-2.5">
        {children}
      </div>
    </div>
  );
}

function MetricChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex-1 rounded-md px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="text-[13px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: color ?? 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

function ScoreBar({ label, value, barClass }: { label: string; value?: number | null; barClass?: string }) {
  const isNull = value == null;
  const v = isNull ? 0 : Number(value);

  return (
    <div style={{ opacity: isNull ? 0.4 : 1 }}>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
        <span className="text-[11px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: isNull ? 'var(--text-muted)' : 'var(--text-primary)' }}>
          {isNull ? 'N/A' : v.toFixed(1)}
        </span>
      </div>
      {!isNull && (
        <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${barClass ?? 'bar-neutral'}`}
            style={{ width: `${v}%` }}
          />
        </div>
      )}
    </div>
  );
}

const CONF_COLORS: Record<string, string> = {
  high: 'var(--accent-etf)',
  medium: 'var(--accent-crypto)',
  low: 'var(--accent-danger)',
};

function ConfidenceBadge({ score, label }: { score?: number; label?: string }) {
  const s = score ?? 0;
  const l = label ?? 'low';
  const color = CONF_COLORS[l] ?? CONF_COLORS.low;
  return (
    <div className="flex-1 rounded-md px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
        Confidence
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <span className="text-[13px] font-medium" style={{ fontFamily: 'var(--font-mono)', color }}>
          {s}
        </span>
        <span className="text-[9px] uppercase" style={{ color }}>{l}</span>
      </div>
    </div>
  );
}

/** Tiny inline sparkline for score history. */
function MiniHistory({ history }: { history: any[] }) {
  const riskPts = history.map((h: any, i: number) => {
    const x = (i / (history.length - 1)) * 100;
    const y = 100 - Number(h.risk_score);
    return `${x},${y}`;
  }).join(' ');

  const upPts = history.map((h: any, i: number) => {
    const x = (i / (history.length - 1)) * 100;
    const y = 100 - Number(h.upward_probability_score);
    return `${x},${y}`;
  }).join(' ');

  const firstDate = history[0]?.score_date;
  const lastDate = history[history.length - 1]?.score_date;

  return (
    <div>
      <svg viewBox="0 0 100 100" className="w-full h-16" preserveAspectRatio="none">
        <polyline points={riskPts} fill="none" stroke="var(--accent-danger)" strokeWidth="1.5" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
        <polyline points={upPts} fill="none" stroke="var(--accent-etf)" strokeWidth="1.5" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between mt-1">
        <span className="text-[9px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{firstDate}</span>
        <div className="flex gap-3">
          <span className="text-[9px]" style={{ color: 'var(--accent-danger)' }}>risk</span>
          <span className="text-[9px]" style={{ color: 'var(--accent-etf)' }}>upward</span>
        </div>
        <span className="text-[9px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{lastDate}</span>
      </div>
    </div>
  );
}
