import { ProtectedRemoteDashboard } from '../components/ProtectedRemoteDashboard';

export const metadata = {
  title: 'Profissional | Licite Comigo',
  description: 'Dashboard profissional protegido do Licite Comigo.',
};

export default function ProfissionalPage() {
  return <ProtectedRemoteDashboard kind="profissional" />;
}
