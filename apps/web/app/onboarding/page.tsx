import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireArea } from '../../lib/session';
import { OnboardingForm } from './OnboardingForm';

export const metadata = {
  title: 'Comece sua jornada | Licite Comigo',
  description: 'Defina seu perfil de aprendizagem para personalizar a Academia.',
};

export default async function OnboardingPage() {
  const session = await requireArea('administracao', 'empresa', 'aluno', 'mentor');
  // Empresa monta o perfil (nichos, estados e valores) direto no Alerta de Licitações, de uma vez só.
  if (session.area === 'empresa') redirect('/radar');
  return (
    <main className="academy-page">
      <Link className="back-link" href="/painel">
        ← Voltar ao painel
      </Link>
      <div className="page-heading">
        <p className="eyebrow">Primeiro acesso</p>
        <h1>Seu perfil</h1>
      </div>
      <OnboardingForm area={session.area} initialProfile={session.perfil_jornada} />
    </main>
  );
}
