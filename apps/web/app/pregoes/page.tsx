import Link from 'next/link';
import { Suspense } from 'react';
import { RadarResults } from '../radar/RadarResults';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pregões publicados | Licite Comigo',
  description:
    'Pregões publicados e capturados de fontes oficiais, com prazo de proposta aberto quando informado.',
};

export default function PregoesPage() {
  return (
    <main className="radar-page">
      <div className="page-heading">
        <p className="eyebrow">Mercado público</p>
        <h1>Pregões publicados no seu escopo.</h1>
        <p>
          Esta visão usa a modalidade oficial de pregão e mostra somente registros capturados. Não é
          sala de lances nem substitui o portal oficial.
        </p>
      </div>
      <p className="notice">
        A consulta prioriza a modalidade PNCP de código 6 e propostas ainda abertas quando essa
        informação está disponível.
      </p>
      <Suspense
        fallback={
          <section className="radar-empty">
            <p>Consultando pregões…</p>
          </section>
        }
      >
        <RadarResults initialQuery="codigo_modalidade=6&prazo_proposta_aberto=true" />
      </Suspense>
      <p className="back-link">
        <Link href="/radar">Ajustar filtros no Radar</Link>
      </p>
    </main>
  );
}
