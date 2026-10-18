import { ProtectedRemoteDashboard } from '../components/ProtectedRemoteDashboard';

export const metadata = {
  title: 'Mentorado | Licite Comigo',
  description: 'Acompanhamento da jornada do mentorado.',
};

export default function MentoradoPage() {
  return <ProtectedRemoteDashboard kind="mentorado" />;
}
