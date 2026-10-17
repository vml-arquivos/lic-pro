import Link from 'next/link';
import { DashboardCards } from './dashboard/DashboardCards';

export const metadata = {
  title: 'Dashboard | Licite Comigo',
  description: 'Resumo da conta, empresas, oportunidades e próximos passos.',
};

export default function HomePage() {
  return (
    <main className="dashboard-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Licite Comigo</p>
          <strong>Operação com clareza</strong>
        </div>
        <nav aria-label="Navegação principal">
          <Link href="/radar">Radar</Link>
          <Link href="/academia">Academia</Link>
          <Link href="/ana">Ana</Link>
          <Link href="/login">Conta</Link>
        </nav>
      </header>
      <div className="page-heading dashboard-heading">
        <p className="eyebrow">Dashboard</p>
        <h1>Veja o que pede decisão hoje.</h1>
        <p>
          Uma visão operacional para empresas, mentorias e jornadas de aprendizagem — sem substituir
          a fonte oficial nem a revisão humana.
        </p>
      </div>
      <DashboardCards />
      <p className="notice">
        Marca visual provisória. Conteúdos da Academia continuam em revisão editorial.
      </p>
    </main>
  );
}
