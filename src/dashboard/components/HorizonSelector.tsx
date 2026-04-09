'use client';

import { TIME_HORIZONS } from '../../shared/constants';

interface HorizonSelectorProps {
  value: number;
  onChange: (horizon: number) => void;
}

export function HorizonSelector({ value, onChange }: HorizonSelectorProps) {
  return (
    <div className="flex rounded-md overflow-hidden"
      style={{ border: '1px solid var(--border-subtle)' }}>
      {TIME_HORIZONS.map((h) => (
        <button
          key={h}
          onClick={() => onChange(h)}
          className="relative px-3 py-1 text-[11px] font-medium tracking-wide transition-all duration-200"
          style={{
            fontFamily: 'var(--font-mono)',
            color: value === h ? 'var(--text-primary)' : 'var(--text-muted)',
            background: value === h ? 'rgba(79, 143, 247, 0.12)' : 'transparent',
            borderRight: '1px solid var(--border-subtle)',
          }}
        >
          {value === h && (
            <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'var(--accent-stock)' }} />
          )}
          {h}mo
        </button>
      ))}
    </div>
  );
}
