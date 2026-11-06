import type {Metadata, Viewport} from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/inter/900.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'WOWPRO by WowStampa',
  description: 'Area riservata premium per i clienti WowStampa.',
  applicationName: 'WOWPRO',
  appleWebApp: {capable: true, title: 'WOWPRO', statusBarStyle: 'black-translucent'},
  icons: {icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png'},
  formatDetection: {telephone: false},
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [{media: '(max-width: 760px)', color: '#0a0d15'}],
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
