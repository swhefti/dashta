'use client';

interface ModeSelectorProps {
  value: string;
  onChange: (mode: string) => void;
}

const MODES = [
  { key: 'percentile', label: 'Relative' },
  { key: 'absolute', label: 'Absolute' },
] as const;

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <div className="flex rounded-md overflow-hidden"
      style={{ border: '1px solid var(--border-subtle)' }}>
      {MODES.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className="relative px-3 py-1 text-[11px] font-medium tracking-wide transition-all duration-200"
          style={{
            fontFamily: 'var(--font-mono)',
            color: value === key ? 'var(--text-primary)' : 'var(--text-muted)',
            background: value === key ? 'rgba(79, 143, 247, 0.12)' : 'transparent',
            borderRight: '1px solid var(--border-subtle)',
          }}
        >
          {value === key && (
            <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'var(--accent-stock)' }} />
          )}
          {label}
        </button>
      ))}
    </div>
  );
}
