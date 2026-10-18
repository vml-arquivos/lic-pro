import Link from 'next/link';
import { DashboardCards } from './dashboard/DashboardCards';

export const metadata = {
  title: 'Início | Licite Comigo',
  description: 'Resumo da conta, empresas, oportunidades e próximos passos.',
};

const actions = [
  {
    title: 'Buscar oportunidades',
    description: 'Encontre editais por fonte, modalidade e período.',
    href: '/radar',
    icon: '⌕',
  },
  {
    title: 'Minhas oportunidades',
    description: 'Retome o pipeline das empresas vinculadas.',
    href: '/radar',
    icon: '▦',
  },
  {
    title: 'Enviar um edital',
    description: 'Faça upload de um PDF para leitura com evidências.',
    href: '/radar',
    icon: '↑',
  },
  {
    title: 'Conhecer empresas',
    description: 'Gerencie CNPJ e vínculos autorizados.',
    href: '/empresas',
    icon: '◇',
  },
  {
    title: 'Aprender na Academia',
    description: 'Siga uma trilha de fundamentos e prática.',
    href: '/academia',
    icon: '◌',
  },
  {
    title: 'Conversar com Ana',
    description: 'Pergunte, consulte fontes e mantenha leitura somente.',
    href: '/ana',
    icon: '✦',
    featured: true,
  },
  {
    title: 'Agenda e prazos',
    description: 'Organize prazos quando o módulo estiver disponível.',
    href: '',
    icon: '◷',
    soon: true,
  },
  {
    title: 'Automações e aprovações',
    description: 'Central de execução controlada, em breve.',
    href: '',
    icon: '◎',
    soon: true,
  },
];

export default function HomePage() {
  return (
    <main className="dashboard-page">
      <div className="page-heading dashboard-heading">
        <p className="eyebrow">Início</p>
        <h1>O que precisa da sua decisão hoje?</h1>
        <p>Escolha uma ação. A plataforma mostra somente o que já está disponível nesta etapa.</p>
      </div>
      <section className="action-grid" aria-label="Ações principais">
        {actions.map((action) =>
          action.soon ? (
            <div className="action-card action-soon" key={action.title}>
              <span className="action-icon">{action.icon}</span>
              <div>
                <h2>{action.title}</h2>
                <p>{action.description}</p>
              </div>
              <small>Em breve</small>
            </div>
          ) : (
            <Link
              className={`action-card ${action.featured ? 'action-featured' : ''}`}
              href={action.href}
              key={action.title}
            >
              <span className="action-icon">{action.icon}</span>
              <div>
                <h2>{action.title}</h2>
                <p>{action.description}</p>
              </div>
              <span className="action-arrow">→</span>
            </Link>
          ),
        )}
      </section>
      <section className="ana-recommendation">
        <div className="ana-recommendation-badge">ANA recomenda</div>
        <div>
          <h2>Comece validando a fonte antes de decidir.</h2>
          <p>
            Uma leitura de apoio fica melhor quando você confirma página, trecho e contexto no
            edital original.
          </p>
        </div>
        <Link href="/ana">Abrir Ana →</Link>
      </section>
      <DashboardCards />
      <p className="notice">
        Conteúdos da Academia continuam em revisão editorial. Não há aprovação automática, tempo
        real ou automação de portais neste MVP.
      </p>
    </main>
  );
}
