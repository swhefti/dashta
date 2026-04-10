'use client';

interface TickerTooltipProps {
  x: number;
  y: number;
  data: any;
}

function formatCap(cap: number | null): string {
  if (!cap) return '--';
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toLocaleString()}`;
}

function formatPrice(price: number | null): string {
  if (!price) return '--';
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}

const ASSET_COLORS: Record<string, string> = {
  stock: 'var(--accent-stock)',
  etf: 'var(--accent-etf)',
  crypto: 'var(--accent-crypto)',
};

export function TickerTooltip({ x, y, data }: TickerTooltipProps) {
  const accentColor = ASSET_COLORS[data.asset_class] ?? 'var(--accent-stock)';

  return (
    <div
      className="fixed z-50 glass-strong rounded-lg shadow-2xl pointer-events-none"
      style={{
        left: x + 16,
        top: y - 8,
        animation: 'fadeInUp 0.15s ease-out',
        minWidth: 200,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="w-[5px] h-[5px] rounded-full" style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }} />
        <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          {data.ticker}
        </span>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {data.asset_class}
        </span>
      </div>

      {/* Company name */}
      <div className="px-3 pt-1">
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {data.company_name}
        </span>
      </div>

      {/* Scores */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 px-3 pt-2 pb-2.5">
        <Row label="Risk" value={data.risk_score?.toFixed(1)} color="var(--accent-danger)" />
        <Row label="Upward" value={data.upward_probability_score?.toFixed(1)} color="var(--accent-etf)" />
        <Row label="Price" value={formatPrice(data.current_price)} />
        <Row label="Conf" value={data.confidence != null ? `${Math.round(Number(data.confidence))} ${data.confidence_label ?? ''}` : '--'}
          color={data.confidence_label === 'high' ? 'var(--accent-etf)' : data.confidence_label === 'medium' ? 'var(--accent-crypto)' : 'var(--text-muted)'} />
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value?: string; color?: string }) {
  return (
    <>
      <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span className="text-[11px] text-right" style={{ fontFamily: 'var(--font-mono)', color: color ?? 'var(--text-primary)' }}>
        {value ?? '--'}
      </span>
    </>
  );
}
