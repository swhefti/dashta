'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { BubbleChart } from '../components/BubbleChart';
import { HorizonSelector } from '../components/HorizonSelector';
import { AssetFilter } from '../components/AssetFilter';
import { SearchBar } from '../components/SearchBar';
import { ModeSelector } from '../components/ModeSelector';
import { DailyBrief } from '../components/DailyBrief';
import { OnboardingOverlay } from '../components/OnboardingOverlay';
import { Logo } from '../components/Logo';
import { useScores, useBrief, useCountUp } from '../lib/hooks';
import type { FreshnessIssue } from '../lib/hooks';
import type { AssetClass } from '../../shared/types';

const QUALITY_STYLES: Record<string, { color: string; label: string }> = {
  healthy: { color: 'var(--accent-etf)', label: 'Healthy' },
  degraded: { color: 'var(--accent-crypto)', label: 'Degraded' },
  blocked: { color: 'var(--accent-danger)', label: 'Blocked' },
};

const SOURCE_LABELS: Record<string, string> = {
  prices: 'Price',
  quotes: 'Quote',
  fundamentals: 'Fundamentals',
  sentiment: 'Sentiment',
  regime: 'Macro regime',
};

function getFreshnessBanner(issues: FreshnessIssue[]): { text: string; isBlocked: boolean } | null {
  if (!issues.length) return null;

  const blocked = issues.filter((i) => i.severity === 'blocked');
  const degraded = issues.filter((i) => i.severity === 'degraded');

  if (blocked.length > 0) {
    const names = blocked.map((i) => SOURCE_LABELS[i.source] ?? i.source).join(' and ');
    const days = blocked[0]!.days_stale < 9999 ? ` (${blocked[0]!.days_stale}d old)` : '';
    return {
      text: `${names} data is stale${days}. Scores from this run should be treated with caution.`,
      isBlocked: true,
    };
  }

  const parts: string[] = [];
  for (const issue of degraded) {
    if (issue.source === 'fundamentals') {
      parts.push(`Fundamentals are ${issue.days_stale}d old — long-horizon value inputs may be less current`);
    } else if (issue.source === 'sentiment') {
      parts.push(`Sentiment is ${issue.days_stale}d old — short-term upward signals may be less reliable`);
    } else if (issue.source === 'regime') {
      parts.push(`Macro regime is ${issue.days_stale}d old — regime signals may be less reliable`);
    }
  }
  return parts.length ? { text: parts.join('. ') + '.', isBlocked: false } : null;
}

export default function DashboardPage() {
  const [horizon, setHorizon] = useState(3);
  const [mode, setMode] = useState('percentile');
  const [activeClasses, setActiveClasses] = useState<Set<AssetClass>>(new Set(['stock', 'etf', 'crypto']));
  const [searchTicker, setSearchTicker] = useState<string | null>(null);
  // Collapsed by default — a first-time visitor should see the chart first,
  // not a wall of text next to it. Any prior explicit preference wins.
  const [briefCollapsed, setBriefCollapsed] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Lives on the parent (not inside BubbleChart) because BubbleChart itself
  // unmounts/remounts on every horizon/mode switch — see the isLoading gate
  // below. A ref here is the only thing that actually survives that churn,
  // so the entrance animation plays exactly once per page view, not once
  // per switch.
  const hasChartAnimatedRef = useRef(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('briefCollapsed') : null;
    if (stored === '1') setBriefCollapsed(true);
    else if (stored === '0') setBriefCollapsed(false);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('briefCollapsed', briefCollapsed ? '1' : '0');
    }
  }, [briefCollapsed]);

  const { data, isLoading, error } = useScores(horizon, mode);

  // Delay the onboarding overlay until the first data load has settled, so
  // it never covers the bubble entrance animation before a visitor gets to
  // see it play. 950ms is the entrance's own worst-case total duration.
  useEffect(() => {
    if (typeof window === 'undefined' || isLoading) return;
    const dismissedPermanently = window.localStorage.getItem('onboardingDismissed') === '1';
    const seenThisSession = window.sessionStorage.getItem('onboardingSeen') === '1';
    if (dismissedPermanently || seenThisSession) return;
    const t = setTimeout(() => setShowOnboarding(true), 950);
    return () => clearTimeout(t);
  }, [isLoading]);

  const dismissOnboarding = (permanent: boolean) => {
    setShowOnboarding(false);
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem('onboardingSeen', '1');
    if (permanent) window.localStorage.setItem('onboardingDismissed', '1');
  };

  const { data: brief, isLoading: briefLoading } = useBrief(horizon, mode);

  // Memoized: BubbleChart's redraw effect keys off this array's identity.
  // A plain .filter() here would return a new reference on every render
  // (including the ~50 renders useCountUp below produces while ticking its
  // display value), tearing down and rebuilding the whole chart on every
  // one of those frames and killing the entrance transition almost as soon
  // as it starts.
  const filteredData = useMemo(
    () => data?.scores?.filter((s: any) => activeClasses.has(s.asset_class)) ?? [],
    [data?.scores, activeClasses],
  );
  const tickerCount = filteredData.length;
  const noData = data?.available === false;
  const fc = data?.factor_completeness ?? 0;
  const rq = data?.run_quality ?? 'healthy';
  const qStyle = QUALITY_STYLES[rq] ?? QUALITY_STYLES.healthy;
  const banner = data?.available ? getFreshnessBanner(data.freshness_issues ?? []) : null;
  const animatedTickerCount = useCountUp(tickerCount);
  const animatedFc = useCountUp(fc);

  return (
    <main className="relative flex flex-col h-screen">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[15%] w-[500px] h-[500px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, var(--accent-stock) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-10%] right-[10%] w-[600px] h-[600px] rounded-full opacity-[0.025]"
          style={{ background: 'radial-gradient(circle, var(--accent-etf) 0%, transparent 70%)' }} />
      </div>

      {/* Freshness banner — source-specific, proportional to severity */}
      {banner && (
        <div
          className="relative z-20 px-6 py-1.5 flex items-center gap-2"
          style={{
            background: banner.isBlocked ? 'rgba(240, 68, 68, 0.08)' : 'rgba(245, 166, 35, 0.07)',
            borderBottom: banner.isBlocked ? '1px solid rgba(240, 68, 68, 0.2)' : '1px solid rgba(245, 166, 35, 0.15)',
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: banner.isBlocked ? 'var(--accent-danger)' : 'var(--accent-crypto)' }}
          />
          <span
            className="text-[11px]"
            style={{
              fontFamily: 'var(--font-mono)',
              color: banner.isBlocked ? 'var(--accent-danger)' : 'var(--accent-crypto)',
            }}
          >
            {banner.text}
          </span>
        </div>
      )}

      <header className="relative z-20 flex items-center justify-between px-6 py-3 border-b"
        style={{ borderColor: 'var(--border-subtle)', background: 'rgba(6, 8, 13, 0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-4">
          <h1><Logo size="sm" /></h1>
          <div className="w-px h-5" style={{ background: 'var(--border-subtle)' }} />
          <div className="flex items-center gap-2">
            {data?.run_date && (
              <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{data.run_date}</span>
            )}
            {data?.available && (
              <>
                <span className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', background: 'var(--border-subtle)' }}>
                  {animatedTickerCount} assets
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ fontFamily: 'var(--font-mono)', color: fc >= 80 ? 'var(--accent-etf)' : fc >= 60 ? 'var(--accent-crypto)' : 'var(--accent-danger)', background: 'var(--border-subtle)' }}
                  title={`${data.coverage?.with_price ?? 0} with price, ${data.coverage?.with_sentiment ?? 0} with sentiment, ${data.coverage?.with_fundamental_value ?? 0} with fundamentals`}>
                  {animatedFc}% factors
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
                  style={{ fontFamily: 'var(--font-mono)', color: qStyle.color, background: 'var(--border-subtle)' }}>
                  <span className="relative w-1 h-1 flex items-center justify-center">
                    {rq === 'healthy' && (
                      <span
                        className="status-ping absolute inset-0 rounded-full"
                        style={{ background: qStyle.color }}
                      />
                    )}
                    <span className="relative w-1 h-1 rounded-full" style={{ background: qStyle.color }} />
                  </span>
                  {qStyle.label}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SearchBar onSearch={setSearchTicker} />
          <div className="w-px h-5" style={{ background: 'var(--border-subtle)' }} />
          <AssetFilter active={activeClasses} onChange={setActiveClasses} />
          <div className="w-px h-5" style={{ background: 'var(--border-subtle)' }} />
          <ModeSelector value={mode} onChange={setMode} />
          <HorizonSelector value={horizon} onChange={setHorizon} />
        </div>
      </header>

      <div className="relative z-10 flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 relative">
          {isLoading && (
            <div className="flex items-center justify-center h-full gap-3">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-stock)' }} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Loading scores...</span>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full">
              <div className="glass rounded-lg px-5 py-3 flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-danger)' }} />
                <span className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-danger)' }}>{error}</span>
              </div>
            </div>
          )}
          {!isLoading && !error && noData && (
            <div className="flex items-center justify-center h-full">
              <div className="glass rounded-lg px-6 py-5 max-w-md text-center space-y-2">
                <div className="text-sm font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>No {horizon}mo scores available</div>
                <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Run <code className="px-1 py-0.5 rounded" style={{ background: 'var(--border-subtle)' }}>npm run score:{horizon}mo</code> to generate.
                </div>
              </div>
            </div>
          )}
          {!isLoading && !error && !noData && (
            <BubbleChart
              scores={filteredData}
              highlightTicker={searchTicker}
              horizon={horizon}
              mode={mode}
              hasAnimatedRef={hasChartAnimatedRef}
            />
          )}
        </div>

        <DailyBrief
          data={brief}
          isLoading={briefLoading}
          collapsed={briefCollapsed}
          onToggleCollapsed={() => setBriefCollapsed((v) => !v)}
          onTickerClick={setSearchTicker}
        />
      </div>

      <footer className="relative z-20 flex items-center justify-between px-6 py-1.5 border-t"
        style={{ borderColor: 'var(--border-subtle)', background: 'rgba(6, 8, 13, 0.9)' }}>
        <span className="text-[10px] tracking-wide" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          scroll to zoom / drag to pan / click for details
        </span>
        <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          x: risk / y: upward probability / size: market cap / {mode}
        </span>
      </footer>

      {showOnboarding && (
        <OnboardingOverlay
          onGotIt={() => dismissOnboarding(false)}
          onDontShowAgain={() => dismissOnboarding(true)}
        />
      )}
    </main>
  );
}
