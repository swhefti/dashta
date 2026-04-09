import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'aiMATA — Risk x Upward Probability Radar',
  description: 'Interactive investment dashboard plotting 100 assets by risk and upward probability',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen overflow-hidden">{children}</body>
    </html>
  );
}
