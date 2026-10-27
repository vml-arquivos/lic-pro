import { redirect } from 'next/navigation';
import { requireArea } from '../../lib/session';
import { AreaHub } from '../components/AreaHub';
import { EmpresaInicio } from './EmpresaInicio';
import { MentorDashboard } from './MentorDashboard';
import { StudentDashboard } from './StudentDashboard';

export const metadata = {
  title: 'Painel | Licite Comigo',
  description: 'Resumo da sua área no Licite Comigo.',
};

export default async function PainelPage() {
  const session = await requireArea('administracao', 'empresa', 'aluno', 'mentor');
  if (session.area === 'administracao') redirect('/admin');
  switch (session.area) {
    case 'aluno':
      return (
        <StudentDashboard
          nome={session.nome}
          nichos={session.nicho_preferencias ?? []}
          onboardingConcluido={session.onboarding_concluido}
          hub={<AreaHub area="aluno" />}
        />
      );
    case 'mentor':
      return <MentorDashboard nome={session.nome} hub={<AreaHub area="mentor" />} />;
    default:
      return (
        <EmpresaInicio
          nome={session.nome}
          nichos={session.nicho_preferencias ?? []}
          hub={<AreaHub area="empresa" />}
        />
      );
  }
}
