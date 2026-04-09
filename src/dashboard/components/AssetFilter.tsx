'use client';

import type { AssetClass } from '../../shared/types';

interface AssetFilterProps {
  active: Set<AssetClass>;
  onChange: (classes: Set<AssetClass>) => void;
}

const CLASSES: { key: AssetClass; label: string; color: string }[] = [
  { key: 'stock', label: 'Stocks', color: 'var(--accent-stock)' },
  { key: 'etf', label: 'ETFs', color: 'var(--accent-etf)' },
  { key: 'crypto', label: 'Crypto', color: 'var(--accent-crypto)' },
];

export function AssetFilter({ active, onChange }: AssetFilterProps) {
  const toggle = (cls: AssetClass) => {
    const next = new Set(active);
    if (next.has(cls)) next.delete(cls);
    else next.add(cls);
    onChange(next);
  };

  return (
    <div className="flex items-center gap-1">
      {CLASSES.map(({ key, label, color }) => {
        const isActive = active.has(key);
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-all duration-200"
            style={{
              opacity: isActive ? 1 : 0.3,
              background: isActive ? `color-mix(in srgb, ${color} 10%, transparent)` : 'transparent',
            }}
          >
            <span
              className="w-[6px] h-[6px] rounded-full transition-all duration-200"
              style={{
                background: color,
                boxShadow: isActive ? `0 0 6px ${color}` : 'none',
              }}
            />
            <span className="text-[11px] font-medium"
              style={{ fontFamily: 'var(--font-mono)', color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
