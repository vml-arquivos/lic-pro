import { ProtectedRemoteDashboard } from '../components/ProtectedRemoteDashboard';

export const metadata = {
  title: 'Painel | Licite Comigo',
  description: 'Resumo protegido da conta no Licite Comigo.',
};

export default function PainelPage() {
  return <ProtectedRemoteDashboard kind="painel" />;
}
