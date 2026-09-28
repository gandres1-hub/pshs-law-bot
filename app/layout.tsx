import type { Metadata, Viewport } from 'next';
import './globals.css';

const title = 'PSHS Law Guide';
const description =
  'Ask questions about the laws that govern the Philippine Science High School System: RA 12310 and its IRR, plus the repealed RA 3661, RA 8496 and RA 9036. Every answer cites the law and section it comes from.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    siteName: title,
    locale: 'en_PH',
  },
  twitter: {
    card: 'summary',
    title,
    description,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
