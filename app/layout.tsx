import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  title: 'Safawala CRM',
  description: 'A clean, secure workspace for the Safawala team.',
  icons: { icon: '/safawala-app-icon.png', apple: '/safawala-app-icon.png' },
  openGraph: {
    title: 'Safawala CRM',
    description: 'Organize every celebration with clarity.',
    type: 'website',
    images: process.env.NEXT_PUBLIC_SITE_URL
      ? [{ url: new URL('/og.png', process.env.NEXT_PUBLIC_SITE_URL).toString(), width: 1792, height: 1024, alt: 'Safawala CRM' }]
      : undefined,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Safawala CRM',
    description: 'Organize every celebration with clarity.',
    images: process.env.NEXT_PUBLIC_SITE_URL
      ? [new URL('/og.png', process.env.NEXT_PUBLIC_SITE_URL).toString()]
      : undefined,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
