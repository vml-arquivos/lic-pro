import Link from 'next/link';
import { getSession } from '../../lib/session';
import '../radar/radar.css';
import { PregoesResults } from './PregoesResults';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pregões publicados | Licite Comigo',
  description:
    'Pregões publicados e capturados de fontes oficiais, com prazo de proposta aberto quando informado.',
};

export default async function PregoesPage() {
  const session = await getSession();
  return (
    <div className="ui-page rd-page">
      <header className="ui-header">
        <div>
          <p className="eyebrow">Mercado público</p>
          <h1>Pregões publicados no seu escopo</h1>
          <p>
            Esta visão usa a modalidade oficial de pregão e mostra somente registros capturados. Não
            é sala de lances nem substitui o portal oficial.
          </p>
        </div>
      </header>
      <PregoesResults signedIn={Boolean(session)} />
      <p>
        <Link href="/radar?codigo_modalidade=6&situacao_prazo=abertas">
          Ajustar filtros no Radar
        </Link>
      </p>
    </div>
  );
}
