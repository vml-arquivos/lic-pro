import { ProtectedRemoteDashboard } from '../components/ProtectedRemoteDashboard';

export const metadata = {
  title: 'Painel do mentor | Licite Comigo',
  description: 'Acompanhamento protegido de mentorados e concessões.',
};

export default function MentorPage() {
  return <ProtectedRemoteDashboard kind="mentor" />;
}
