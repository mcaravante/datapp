import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CDP Admin',
  description: 'Customer Data Platform — admin',
};

// Admin app is 100% authenticated; nothing benefits from static generation,
// and Next's prerender chokes on the next-auth import chain in /_error.
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 font-sans text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
