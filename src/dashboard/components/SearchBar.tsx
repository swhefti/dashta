'use client';

import { useState } from 'react';

interface SearchBarProps {
  onSearch: (ticker: string | null) => void;
}

export function SearchBar({ onSearch }: SearchBarProps) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);

  const handleSubmit = () => {
    const trimmed = value.trim().toUpperCase();
    onSearch(trimmed || null);
  };

  return (
    <div className="relative flex items-center">
      {/* Search icon */}
      <svg className="absolute left-2 w-3.5 h-3.5 pointer-events-none" viewBox="0 0 16 16" fill="none"
        style={{ color: focused ? 'var(--accent-stock)' : 'var(--text-muted)' }}>
        <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (!e.target.value.trim()) onSearch(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Ticker..."
        className="w-24 pl-7 pr-2 py-1 rounded text-[11px] transition-all duration-200 focus:w-32"
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)',
          background: focused ? 'rgba(79, 143, 247, 0.06)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${focused ? 'rgba(79, 143, 247, 0.3)' : 'var(--border-subtle)'}`,
          outline: 'none',
        }}
      />
    </div>
  );
}
