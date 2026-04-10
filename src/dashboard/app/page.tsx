'use client';

import { useState } from 'react';
import { BubbleChart } from '../components/BubbleChart';
import { HorizonSelector } from '../components/HorizonSelector';
import { AssetFilter } from '../components/AssetFilter';
import { SearchBar } from '../components/SearchBar';
import { ModeSelector } from '../components/ModeSelector';
import { useScores } from '../lib/hooks';
import type { AssetClass } from '../../shared/types';

export default function DashboardPage() {
  const [horizon, setHorizon] = useState(3);
  const [mode, setMode] = useState('percentile');
  const [activeClasses, setActiveClasses] = useState<Set<AssetClass>>(
    new Set(['stock', 'etf', 'crypto'])
  );
  const [searchTicker, setSearchTicker] = useState<string | null>(null);

  const { data, isLoading, error } = useScores(horizon, mode);

  const filteredData = data?.scores?.filter(
    (s: any) => activeClasses.has(s.asset_class)
  ) ?? [];

  const tickerCount = filteredData.length;
  const noData = data?.available === false;
  const fc = data?.factor_completeness ?? 0;

  return (
    <main className="relative flex flex-col h-screen">
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[15%] w-[500px] h-[500px] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, var(--accent-stock) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-10%] right-[10%] w-[600px] h-[600px] rounded-full opacity-[0.025]"
          style={{ background: 'radial-gradient(circle, var(--accent-etf) 0%, transparent 70%)' }} />
      </div>

      {/* Top bar */}
      <header className="relative z-20 flex items-center justify-between px-6 py-3 border-b"
        style={{ borderColor: 'var(--border-subtle)', background: 'rgba(6, 8, 13, 0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-semibold tracking-tight" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              aiMATA
            </h1>
            <span className="text-[10px] font-medium tracking-[0.15em] uppercase"
              style={{ color: 'var(--text-muted)' }}>
              Radar
            </span>
          </div>
          <div className="w-px h-5" style={{ background: 'var(--border-subtle)' }} />
          {/* Run metadata */}
          <div className="flex items-center gap-2">
            {data?.run_date && (
              <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                {data.run_date}
              </span>
            )}
            {data?.available && (
              <>
                <span className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', background: 'var(--border-subtle)' }}>
                  {tickerCount} assets
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: fc >= 80 ? 'var(--accent-etf)' : fc >= 60 ? 'var(--accent-crypto)' : 'var(--accent-danger)',
                    background: 'var(--border-subtle)',
                  }}
                  title={`${data.coverage?.with_price ?? 0} with price, ${data.coverage?.with_sentiment ?? 0} with sentiment, ${data.coverage?.with_fundamental_value ?? 0} with fundamentals`}
                >
                  {fc}% coverage
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

      {/* Chart area */}
      <div className="relative z-10 flex-1 min-h-0">
        {isLoading && (
          <div className="flex items-center justify-center h-full gap-3">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-stock)' }} />
            <span className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              Loading scores...
            </span>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="glass rounded-lg px-5 py-3 flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-danger)' }} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-danger)' }}>
                {error}
              </span>
            </div>
          </div>
        )}
        {!isLoading && !error && noData && (
          <div className="flex items-center justify-center h-full">
            <div className="glass rounded-lg px-6 py-5 max-w-md text-center space-y-2">
              <div className="text-sm font-medium" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                No {horizon}mo scores available
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                The scoring pipeline has not been run for the {horizon}-month horizon yet.
                Run <code className="px-1 py-0.5 rounded" style={{ background: 'var(--border-subtle)' }}>npm run score:{horizon}mo</code> to generate scores.
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
          />
        )}
      </div>

      {/* Bottom status bar */}
      <footer className="relative z-20 flex items-center justify-between px-6 py-1.5 border-t"
        style={{ borderColor: 'var(--border-subtle)', background: 'rgba(6, 8, 13, 0.9)' }}>
        <span className="text-[10px] tracking-wide"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          scroll to zoom / drag to pan / click for details
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[10px]"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            x: risk / y: upward probability / size: market cap / {mode}
          </span>
        </div>
      </footer>
    </main>
  );
}
