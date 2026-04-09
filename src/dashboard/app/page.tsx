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
        {/* Left: Brand */}
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
          <div className="flex items-center gap-2">
            {data?.run_date && (
              <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                {data.run_date}
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', background: 'var(--border-subtle)' }}>
              {tickerCount} assets
            </span>
          </div>
        </div>

        {/* Right: Controls */}
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
        {!isLoading && !error && (
          <BubbleChart
            scores={filteredData}
            highlightTicker={searchTicker}
            horizon={horizon}
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
            x: risk / y: upward probability / size: market cap / mode: {mode}
          </span>
        </div>
      </footer>
    </main>
  );
}
