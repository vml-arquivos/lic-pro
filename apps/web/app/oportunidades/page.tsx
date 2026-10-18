import { ProtectedRemoteDashboard } from '../components/ProtectedRemoteDashboard';

export const metadata = {
  title: 'Oportunidades | Licite Comigo',
  description: 'Oportunidades salvas pela sua conta e retornadas pelo Core API.',
};

export default function OportunidadesPage() {
  return <ProtectedRemoteDashboard kind="oportunidades" />;
}
