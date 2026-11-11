import { requireArea } from '../../../lib/session';
import { PageHeader } from '../../components/ui';
import { TeamAdmin } from './TeamAdmin';

export const metadata = {
  title: 'Equipe administrativa | Licite Comigo',
  description: 'Quem acessa o Painel admin: convite, edição e senha.',
};

export default async function TeamPage() {
  await requireArea('administracao');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Painel admin"
        title="Equipe administrativa"
        description="Usuários do sistema administrativo. Convide novos administradores, edite os dados e gere link de senha."
      />
      <TeamAdmin />
    </main>
  );
}
