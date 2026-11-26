import Link from 'next/link';
import { getSession } from '../../lib/session';
import '../radar/radar.css';
import { PregoesResults } from './PregoesResults';
import { DadosAtualizados } from '../components/DadosAtualizados';
import { LicitacoesNav } from '../components/LicitacoesNav';

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
      <LicitacoesNav atual="/pregoes" area={session?.area} />
      {session ? <DadosAtualizados /> : null}
      <header className="ui-header">
        <div>
          <p className="eyebrow">Licitações</p>
          <h1>Pregões</h1>
        </div>
      </header>
      <PregoesResults
        signedIn={Boolean(session)}
        nichosTravados={session?.area === 'colaborador'}
      />
      <p>
        <Link href="/radar?codigo_modalidade=6&situacao_prazo=abertas">
          Ajustar filtros no Farol
        </Link>
      </p>
    </div>
  );
}
