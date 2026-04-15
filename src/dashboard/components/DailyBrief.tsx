'use client';

import { useState } from 'react';
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
  // If weekly agrees with daily (same direction, |weekly|>=2), mark "broad"
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
  direction: 'up' | 'down' | 'mixed';
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
          <span
            className="w-1 h-3 rounded-sm flex-shrink-0"
            style={{ background: accent }}
          />
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
            const primary = direction === 'up' ? du : direction === 'down' ? dr : (Math.abs(du ?? 0) >= Math.abs(dr ?? 0) ? du : dr);
            const primaryLabel = direction === 'up' ? 'upward' : direction === 'down' ? 'risk' : (Math.abs(du ?? 0) >= Math.abs(dr ?? 0) ? 'upward' : 'risk');
            const primaryColor = direction === 'up'
              ? 'var(--accent-etf)'
              : direction === 'down'
                ? 'var(--accent-danger)'
                : (primary ?? 0) >= 0 ? 'var(--accent-etf)' : 'var(--accent-danger)';
            const secondary = direction === 'up' ? dr : direction === 'down' ? du : (primaryLabel === 'upward' ? dr : du);
            const secondaryLabel = direction === 'up' ? 'risk' : direction === 'down' ? 'upward' : (primaryLabel === 'upward' ? 'risk' : 'upward');

            return (
              <button
                key={t.ticker}
                onClick={() => onTickerClick(t.ticker)}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-white/[0.03] transition-colors"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: ASSET_COLORS[t.asset_class] ?? 'var(--text-muted)' }}
                />
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
                  <div className="flex items-center gap-2 text-[10px]" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: primaryColor }}>
                      {primaryLabel} {fmtDelta(primary)}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      · {secondaryLabel} {fmtDelta(secondary)}
                    </span>
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
  onTickerClick: (ticker: string) => void;
}

export function DailyBrief({ data, isLoading, onTickerClick }: DailyBriefProps) {
  const [expanded, setExpanded] = useState(true);

  if (isLoading) {
    return (
      <div className="px-6 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          Loading daily brief…
        </div>
      </div>
    );
  }

  if (!data || !data.available || !data.cards) return null;

  const { headline, sub, stats, runs, cards } = data;
  const hasPrev = !!runs?.previous;
  const hasWeekly = !!runs?.weekly;

  return (
    <section
      className="relative z-10 border-b"
      style={{ borderColor: 'var(--border-subtle)', background: 'rgba(10, 14, 22, 0.55)', backdropFilter: 'blur(8px)' }}
    >
      <div className="px-6 pt-3 pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
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
            <p className="text-[13px] leading-snug" style={{ color: 'var(--text-primary)' }}>
              {headline}
            </p>
            {sub && (
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {sub}
              </p>
            )}
          </div>

          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] px-2 py-1 rounded flex-shrink-0"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {/* Context strip */}
        <div className="flex items-center gap-3 mt-2 text-[10px] flex-wrap" style={{ fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            vs yesterday
            <span className="ml-1" style={{ color: hasPrev ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
              {hasPrev && stats
                ? `${stats.improvedCount} up / ${stats.weakenedCount} down · avg upward ${fmtDelta(stats.avgUpwardDelta)} / risk ${fmtDelta(stats.avgRiskDelta)}`
                : 'no prior run'}
            </span>
          </span>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          <span style={{ color: 'var(--text-muted)' }}>
            vs last week
            <span className="ml-1" style={{ color: hasWeekly ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
              {hasWeekly && runs?.weekly ? `ref ${runs.weekly.run_date}` : 'not enough history'}
            </span>
          </span>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          <span style={{ color: 'var(--text-muted)' }}>
            run quality
            <span className="ml-1" style={{
              color: runs?.latest?.run_quality === 'healthy'
                ? 'var(--accent-etf)'
                : runs?.latest?.run_quality === 'degraded' ? 'var(--accent-crypto)' : 'var(--accent-danger)',
            }}>
              {runs?.latest?.run_quality ?? '—'}
            </span>
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-6 pb-3 grid grid-cols-1 md:grid-cols-3 gap-3">
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
          <BriefCard
            title="Large-Cap Moves"
            subtitle="names you'll recognize"
            accent="var(--accent-stock)"
            items={cards.largeCap}
            direction="mixed"
            onTickerClick={onTickerClick}
            emptyCopy="Quiet day at the top of the market."
          />
        </div>
      )}
    </section>
  );
}
