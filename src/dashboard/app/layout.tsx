import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Risk vs. Upward Radar',
  description: 'Every asset, on the radar — an interactive investment dashboard plotting 130+ assets by risk and upward probability.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen overflow-hidden">{children}</body>
    </html>
  );
}
