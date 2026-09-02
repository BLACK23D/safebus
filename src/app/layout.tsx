import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { SocketProvider } from '@/components/providers/socket-provider';
import { RegisterSW } from '@/components/pwa/register-sw';
import { Toaster } from '@/components/ui/sonner';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'SafeBus — Live School Bus Tracking', template: '%s · SafeBus' },
  description:
    'Live school bus tracking, verified pickup/drop-off, attendance, messaging and safety alerts for parents, drivers and schools.',
  manifest: '/manifest.webmanifest',
  applicationName: 'SafeBus',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'SafeBus' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#1976D2',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SocketProvider>
            {children}
            <RegisterSW />
            <Toaster position="top-center" />
          </SocketProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
