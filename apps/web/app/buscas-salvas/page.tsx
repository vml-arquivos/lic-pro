import { ProtectedRemoteDashboard } from '../components/ProtectedRemoteDashboard';

export const metadata = {
  title: 'Buscas salvas | Licite Comigo',
  description: 'Consultas salvas da conta no Licite Comigo.',
};

export default function BuscasSalvasPage() {
  return <ProtectedRemoteDashboard kind="buscas-salvas" />;
}
