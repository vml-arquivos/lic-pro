import { NICHE_CATALOG } from '@licitecomigo/shared';
import { getSession, requireArea } from '../../lib/session';
import { PageHeader } from '../components/ui';
import { PrecosApp } from './PrecosApp';
import { LicitacoesNav } from '../components/LicitacoesNav';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Preços pagos | Licite Comigo',
  description: 'O que o governo pagou por item e como fecharam os pregões do seu nicho.',
};

export default async function PrecosPage() {
  await requireArea('empresa', 'aluno', 'administracao', 'colaborador');
  const session = await getSession();
  const chosen = session?.nicho_preferencias ?? [];
  // Quem já escolheu nichos vê só os dele; a Administração, sem nichos, vê todos.
  const nichos = NICHE_CATALOG.filter((niche) =>
    chosen.length ? chosen.includes(niche.code) : session?.area === 'administracao',
  ).map(({ code, label }) => ({ code, label }));
  return (
    <main className="ui-page">
      <LicitacoesNav atual="/precos" area={session?.area} />
      <PageHeader
        eyebrow="Ferramentas"
        title="Preços pagos"
        description="Quanto o governo pagou por um item e como os pregões do seu nicho fecharam, com a fonte oficial."
      />
      <PrecosApp nichos={nichos} />
    </main>
  );
}
