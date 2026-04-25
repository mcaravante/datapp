import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CDP Admin',
  description: 'Customer Data Platform — admin',
};

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
