'use client';

import { useEffect, useState } from 'react';

interface TickerDetailProps {
  data: any;
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

export function TickerDetail({ data, onClose }: TickerDetailProps) {
  const [visible, setVisible] = useState(false);
  const accentColor = ASSET_COLORS[data.asset_class] ?? 'var(--accent-stock)';

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 transition-opacity duration-300"
        style={{ background: 'rgba(0,0,0,0.4)', opacity: visible ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Panel */}
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

          {/* Key metrics row */}
          <div className="flex gap-4 mt-3">
            <MetricChip label="Price" value={data.current_price ? `$${Number(data.current_price).toFixed(2)}` : '--'} />
            <MetricChip label="Mkt Cap" value={formatCap(data.market_cap)} />
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-5">
          {/* Composite scores */}
          <Section title="Composite Scores">
            <ScoreBar label="Risk Score" value={data.risk_score} barClass="bar-risk" />
            <ScoreBar label="Upward Probability" value={data.upward_probability_score} barClass="bar-upward" />
          </Section>

          {/* Risk breakdown */}
          <Section title="Risk Breakdown">
            <ScoreBar label="Volatility" value={data.volatility_score} />
            <ScoreBar label="Max Drawdown" value={data.max_drawdown_score} />
            <ScoreBar label="Beta" value={data.beta_score} />
            <ScoreBar label="Liquidity Risk" value={data.liquidity_risk_score} />
            <ScoreBar label="Fundamental Fragility" value={data.fundamental_fragility_score} />
          </Section>

          {/* Upward breakdown */}
          <Section title="Upward Breakdown">
            <ScoreBar label="Trend Momentum" value={data.trend_momentum_score} />
            <ScoreBar label="Mean Reversion" value={data.mean_reversion_score} />
            <ScoreBar label="Fundamental Value" value={data.fundamental_value_score} />
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

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-md px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="text-[13px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

function ScoreBar({ label, value, barClass }: { label: string; value?: number; barClass?: string }) {
  const v = value != null ? Number(value) : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
        <span className="text-[11px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          {v.toFixed(1)}
        </span>
      </div>
      <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barClass ?? 'bar-neutral'}`}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}
