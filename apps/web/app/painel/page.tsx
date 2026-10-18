import { DashboardCards } from '../dashboard/DashboardCards';

export const metadata = {
  title: 'Painel | Licite Comigo',
  description: 'Resumo protegido da conta no Licite Comigo.',
};

export default function PainelPage() {
  return (
    <main className="account-dashboard">
      <DashboardCards />
    </main>
  );
}
