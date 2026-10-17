import type { Metadata } from 'next';
import { AnaWidget } from './ana/AnaWidget';
import './globals.css';

export const metadata: Metadata = {
  title: 'Licite Comigo',
  description: 'Apoio à decisão e formação para licitações públicas brasileiras.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <AnaWidget />
      </body>
    </html>
  );
}
