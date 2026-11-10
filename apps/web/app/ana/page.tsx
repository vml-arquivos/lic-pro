import Link from 'next/link';
import type { Area } from '@licitecomigo/shared';
import { getSessionResult } from '../../lib/session';
import { HUB_NODES } from '../components/hubs';
import { Icon } from '../components/Icon';
import { AnaChat } from './AnaChat';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ana | Licite Comigo',
  description: 'Sua assistente no Licite Comigo.',
};

const SUGESTOES: Record<Area, readonly string[]> = {
  empresa: [
    'Quanto o governo pagou por itens do meu nicho?',
    'Quais documentos devo conferir antes de disputar?',
    'Qual é o próximo passo na minha oportunidade?',
    'Como analisar um edital?',
  ],
  colaborador: [
    'Quanto o governo pagou por itens do meu nicho?',
    'Quais documentos devo conferir antes de disputar?',
    'Como analisar um edital?',
    'O que é sessão de disputa?',
  ],
  administracao: [
    'Como analisar um edital?',
    'Quanto o governo pagou por itens de um nicho?',
    'Qual é o próximo passo?',
  ],
  aluno: [
    'O que é habilitação?',
    'Como analisar um edital?',
    'Qual é o próximo passo do meu plano?',
    'Como funciona o pregão eletrônico?',
  ],
  mentor: [
    'Como explicar a fase de proposta?',
    'Quais erros comuns revisar com o aluno?',
    'Como analisar um edital?',
  ],
};

export default async function AnaPage() {
  const result = await getSessionResult();
  const area: Area = result.status === 'ok' ? result.session.area : 'empresa';
  const atalhos = (HUB_NODES[area] ?? []).filter((node) => node.href !== '/ana').slice(0, 5);
  return (
    <main className="ui-page ana-page">
      <header className="ana-hero">
        <span className="ana-hero-orb" aria-hidden="true" />
        <div>
          <p className="eyebrow">Sua assistente</p>
          <h1>Ana</h1>
        </div>
      </header>
      <AnaChat sugestoes={SUGESTOES[area]} />
      {atalhos.length ? (
        <nav className="ana-shortcuts" aria-label="Atalhos">
          {atalhos.map((node) => (
            <Link key={node.href} href={node.href}>
              <Icon name={node.icon} size={16} />
              {node.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </main>
  );
}
