import { CompraStatus } from './CompraStatus';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sua compra | Licite Comigo',
  robots: { index: false, follow: false },
};

export default function CompraPage() {
  return (
    <main className="shop">
      <CompraStatus />
    </main>
  );
}
