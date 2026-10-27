import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionResult } from '../lib/session';
import { Icon } from './components/Icon';
import { HUB_VISITOR, hubPhoto } from './components/hubs';
import { NetworkHub } from './components/NetworkHub';
import { HomeWorkspace } from './workspace/HomeWorkspace';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Licite Comigo | Licitações com mentoria e inteligência conectada',
  description:
    'Radar de licitações com dados do governo, prazos, documentos, curso e mentoria em um só lugar.',
};

const PILLARS = [
  [
    'building',
    'Para empresas',
    'Encontre editais compatíveis, acompanhe cada oportunidade no pipeline e não perca prazos nem documentos vencidos.',
  ],
  [
    'cap',
    'Para alunos',
    'Plano de 30 dias, aulas, prática com editais reais e devolutivas da mentora em cada etapa.',
  ],
  [
    'users',
    'Para mentores',
    'Veja quem está parado, comente as práticas e conduza as sessões sem planilhas paralelas.',
  ],
] as const;

export default async function HomePage() {
  if (process.env.DEMO_MODE === 'true') return <HomeWorkspace demoMode />;
  const result = await getSessionResult();
  if (result.status === 'ok') {
    redirect(result.session.area === 'administracao' ? '/admin' : '/painel');
  }
  return (
    <main className="landing">
      <div className="landing-bar">
        <span className="sidebar-wordmark">
          Licite<span>Comigo</span>
        </span>
        <div className="landing-actions">
          <Link className="ui-btn ui-btn-ghost" href="/radar">
            Explorar licitações
          </Link>
          <Link className="ui-btn" href="/login">
            Entrar <Icon name="arrow" size={14} />
          </Link>
        </div>
      </div>

      <NetworkHub
        nodes={HUB_VISITOR}
        photo={hubPhoto()}
        head={{
          eyebrow: 'Rede de especialistas',
          lead: 'Uma mentora.',
          highlight: 'Inteligência conectada.',
          text: 'A Ana é o núcleo vivo do sistema: entende o seu contexto, abre a ferramenta certa e transforma os dados públicos das licitações em clareza.',
        }}
        cta={{
          label: 'Entrar',
          href: '/login',
          title: 'Ana',
          text: 'Entre para conversar com a Ana. As respostas trazem a fonte e dizem quando faltar informação.',
        }}
      />

      <section className="landing-pillars" aria-label="Para quem é">
        {PILLARS.map(([icon, title, text]) => (
          <article key={title}>
            <span className="pillar-ico">
              <Icon name={icon} size={20} />
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <p className="landing-foot">
        Dados de fontes públicas oficiais (PNCP e Compras.gov.br). Sempre confira o edital original
        antes de decidir.
      </p>
    </main>
  );
}
