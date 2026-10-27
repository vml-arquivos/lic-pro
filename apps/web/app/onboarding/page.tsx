import Link from 'next/link';
import { requireArea } from '../../lib/session';
import { OnboardingForm } from './OnboardingForm';

export const metadata = {
  title: 'Comece sua jornada | Licite Comigo',
  description: 'Defina seu perfil de aprendizagem para personalizar a Academia.',
};

export default async function OnboardingPage() {
  const session = await requireArea('administracao', 'empresa', 'aluno', 'mentor');
  return (
    <main className="academy-page">
      <Link className="back-link" href="/painel">
        ← Voltar ao painel
      </Link>
      <div className="page-heading">
        <p className="eyebrow">Primeiro acesso</p>
        <h1>Vamos montar sua jornada.</h1>
        <p>
          São cinco perguntas curtas. Elas ajudam a ajustar o ritmo, os termos explicados e o tipo
          de próximo passo recomendado.
        </p>
      </div>
      <OnboardingForm area={session.area} initialProfile={session.perfil_jornada} />
    </main>
  );
}
