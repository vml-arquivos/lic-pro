import { ProtectedRemoteDashboard } from '../components/ProtectedRemoteDashboard';

export const metadata = {
  title: 'Alertas | Licite Comigo',
  description: 'Alertas da conta retornados por serviços autorizados.',
};

export default function AlertasPage() {
  return <ProtectedRemoteDashboard kind="alertas" />;
}
