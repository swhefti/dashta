interface LogoProps {
  size?: 'sm' | 'lg';
}

const SIZES = {
  sm: { icon: 26, main: 15, sub: 12.5, radar: 10, gap: 10 },
  lg: { icon: 40, main: 22, sub: 17, radar: 14, gap: 14 },
};

export function Logo({ size = 'sm' }: LogoProps) {
  const s = SIZES[size];

  return (
    <div className="flex items-center" style={{ gap: s.gap }}>
      <svg width={s.icon} height={s.icon} viewBox="0 0 26 26" aria-hidden="true" className="flex-shrink-0">
        <circle cx="13" cy="13" r="10.5" fill="none" stroke="var(--accent-stock)" strokeOpacity="0.35" strokeWidth="1.2" />
        <circle cx="13" cy="13" r="6.5" fill="none" stroke="var(--accent-stock)" strokeOpacity="0.55" strokeWidth="1.2" />
        <line x1="13" y1="13" x2="20.5" y2="5.5" stroke="var(--accent-stock)" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="13" cy="13" r="1.6" fill="var(--accent-stock)" />
      </svg>
      <div className="flex flex-col leading-none flex-shrink-0">
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: s.main, lineHeight: 1, whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--text-primary)' }}>RISK</span>
          <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: s.sub }}> vs. </span>
          <span style={{ color: 'var(--accent-stock)' }}>UPWARD</span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            fontSize: s.radar,
            letterSpacing: '0.14em',
            color: 'var(--text-secondary)',
            marginTop: size === 'lg' ? 4 : 2,
          }}
        >
          RADAR
        </div>
      </div>
    </div>
  );
}
