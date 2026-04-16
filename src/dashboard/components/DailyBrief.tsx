'use client';

import type { BriefData, BriefTicker } from '../lib/hooks';

const ASSET_COLORS: Record<string, string> = {
  stock: 'var(--accent-stock)',
  etf: 'var(--accent-etf)',
  crypto: 'var(--accent-crypto)',
};

function fmtDelta(v: number | null, digits = 1): string {
  if (v == null) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}`;
}

function fmtCap(cap: number | null): string {
  if (!cap) return '—';
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toLocaleString()}`;
}

function moveTone(t: BriefTicker): { label: string; color: string } {
  const du = t.daily.upwardDelta ?? 0;
  const dr = t.daily.riskDelta ?? 0;
  const wu = t.weekly.upwardDelta;
  if (wu != null && Math.abs(wu) >= 2 && Math.sign(wu) === Math.sign(du) && du !== 0) {
    return { label: 'weekly-aligned', color: 'var(--accent-etf)' };
  }
  if (wu != null && Math.abs(wu) >= 3 && Math.sign(wu) !== Math.sign(du) && du !== 0) {
    return { label: 'one-day', color: 'var(--text-muted)' };
  }
  if (Math.abs(du) + Math.abs(dr) >= 6) return { label: 'notable', color: 'var(--text-secondary)' };
  return { label: 'modest', color: 'var(--text-muted)' };
}

interface BriefCardProps {
  title: string;
  subtitle: string;
  accent: string;
  items: BriefTicker[];
  direction: 'up' | 'down';
  onTickerClick: (ticker: string) => void;
  emptyCopy: string;
}

function BriefCard({ title, subtitle, accent, items, direction, onTickerClick, emptyCopy }: BriefCardProps) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2 min-w-0"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1 h-3 rounded-sm flex-shrink-0" style={{ background: accent }} />
          <span className="text-[11px] font-semibold tracking-wide uppercase truncate"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {title}
          </span>
        </div>
        <span className="text-[9px] tracking-wide uppercase whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
          {subtitle}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>{emptyCopy}</div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((t) => {
            const tone = moveTone(t);
            const du = t.daily.upwardDelta;
            const dr = t.daily.riskDelta;
            const primary = direction === 'up' ? du : dr;
            const primaryLabel = direction === 'up' ? 'upward' : 'risk';
            const primaryColor = direction === 'up' ? 'var(--accent-etf)' : 'var(--accent-danger)';
            const secondary = direction === 'up' ? dr : du;
            const secondaryLabel = direction === 'up' ? 'risk' : 'upward';

            return (
              <button
                key={t.ticker}
                onClick={() => onTickerClick(t.ticker)}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-white/[0.03] transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: ASSET_COLORS[t.asset_class] ?? 'var(--text-muted)' }} />
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[12px] font-semibold truncate"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {t.ticker}
                    </span>
                    <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {t.company_name ?? ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] flex-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: primaryColor }}>{primaryLabel} {fmtDelta(primary)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>· {secondaryLabel} {fmtDelta(secondary)}</span>
                    <span style={{ color: tone.color }}>· {tone.label}</span>
                  </div>
                </div>
                <span className="text-[9px] whitespace-nowrap"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {fmtCap(t.market_cap)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DailyBriefProps {
  data: BriefData | null;
  isLoading: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onTickerClick: (ticker: string) => void;
}

export function DailyBrief({ data, isLoading, collapsed, onToggleCollapsed, onTickerClick }: DailyBriefProps) {
  // Collapsed rail — thin vertical strip with expand arrow
  if (collapsed) {
    return (
      <aside
        className="relative z-10 border-l flex flex-col items-center py-3"
        style={{
          width: 28,
          borderColor: 'var(--border-subtle)',
          background: 'rgba(10, 14, 22, 0.55)',
          backdropFilter: 'blur(8px)',
          transition: 'width 200ms ease',
        }}
      >
        <button
          onClick={onToggleCollapsed}
          aria-label="Expand daily brief"
          className="flex items-center justify-center w-6 h-6 rounded hover:bg-white/[0.05] transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div
          className="mt-3 text-[9px] font-semibold tracking-[0.2em] uppercase"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}
        >
          Daily Brief
        </div>
      </aside>
    );
  }

  if (isLoading) {
    return (
      <aside
        className="relative z-10 border-l flex flex-col"
        style={{
          width: 360,
          borderColor: 'var(--border-subtle)',
          background: 'rgba(10, 14, 22, 0.55)',
          backdropFilter: 'blur(8px)',
          transition: 'width 200ms ease',
        }}
      >
        <div className="p-4 text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          Loading daily brief…
        </div>
      </aside>
    );
  }

  if (!data || !data.available || !data.cards) {
    return (
      <aside
        className="relative z-10 border-l flex flex-col items-end p-2"
        style={{
          width: 360,
          borderColor: 'var(--border-subtle)',
          background: 'rgba(10, 14, 22, 0.55)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <button
          onClick={onToggleCollapsed}
          aria-label="Collapse daily brief"
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
        >
          <span>Collapse</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </aside>
    );
  }

  const { headline, sub, stats, runs, cards } = data;
  const hasPrev = !!runs?.previous;
  const hasWeekly = !!runs?.weekly;

  return (
    <aside
      className="relative z-10 border-l flex flex-col min-h-0 overflow-y-auto"
      style={{
        width: 360,
        borderColor: 'var(--border-subtle)',
        background: 'rgba(10, 14, 22, 0.55)',
        backdropFilter: 'blur(8px)',
        transition: 'width 200ms ease',
      }}
    >
      {/* Header: title + date + collapse button */}
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-semibold tracking-[0.18em] uppercase"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              Daily Brief
            </span>
            {runs?.latest?.run_date && (
              <span className="text-[9px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                · {runs.latest.run_date}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onToggleCollapsed}
          aria-label="Collapse daily brief"
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded flex-shrink-0 hover:bg-white/[0.04] transition-colors"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
        >
          <span>Collapse</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Headline + sub */}
      <div className="px-4 pb-2">
        <p className="text-[13px] leading-snug" style={{ color: 'var(--text-primary)' }}>
          {headline}
        </p>
        {sub && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            {sub}
          </p>
        )}
      </div>

      {/* Context strip */}
      <div className="px-4 pb-3 flex flex-col gap-0.5 text-[10px]" style={{ fontFamily: 'var(--font-mono)' }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>vs yesterday — </span>
          <span style={{ color: hasPrev ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            {hasPrev && stats
              ? `${stats.improvedCount} up / ${stats.weakenedCount} down · avg up ${fmtDelta(stats.avgUpwardDelta)} / risk ${fmtDelta(stats.avgRiskDelta)}`
              : 'no prior run'}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>vs last week — </span>
          <span style={{ color: hasWeekly ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            {hasWeekly && runs?.weekly ? `ref ${runs.weekly.run_date}` : 'not enough history'}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>run quality — </span>
          <span style={{
            color: runs?.latest?.run_quality === 'healthy'
              ? 'var(--accent-etf)'
              : runs?.latest?.run_quality === 'degraded' ? 'var(--accent-crypto)' : 'var(--accent-danger)',
          }}>
            {runs?.latest?.run_quality ?? '—'}
          </span>
        </div>
      </div>

      {/* Cards — stacked vertically */}
      <div className="px-4 pb-4 flex flex-col gap-3">
        <BriefCard
          title="What Improved"
          subtitle="upward signals"
          accent="var(--accent-etf)"
          items={cards.improved}
          direction="up"
          onTickerClick={onTickerClick}
          emptyCopy={hasPrev ? 'No meaningful upward moves today.' : 'Needs a prior run to compare.'}
        />
        <BriefCard
          title="What Got Riskier"
          subtitle="risk drift"
          accent="var(--accent-danger)"
          items={cards.riskier}
          direction="down"
          onTickerClick={onTickerClick}
          emptyCopy={hasPrev ? 'Risk held steady — no notable spikes.' : 'Needs a prior run to compare.'}
        />
      </div>
    </aside>
  );
}
