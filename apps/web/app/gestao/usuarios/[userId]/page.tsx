import { requireArea } from '../../../../lib/session';
import { PageHeader } from '../../../components/ui';
import { FichaUsuario } from '../../../admin/usuarios/[userId]/FichaUsuario';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ficha do usuário | Licite Comigo',
  description: 'Dados, acessos, buscas e histórico de um aluno ou mentor.',
};

export default async function UserFichaPage({
  params,
  searchParams,
}: Readonly<{
  params: { userId: string };
  searchParams: { editar?: string };
}>) {
  const session = await requireArea('curso');
  return (
    <main className="ui-page">
      <PageHeader
        eyebrow="Administração do curso"
        title="Ficha do usuário"
        description="Quem é, o que já acessou, o que buscou e o que está procurando."
      />
      <FichaUsuario
        userId={params.userId}
        selfId={session.id}
        startEditing={searchParams.editar === '1'}
      />
    </main>
  );
}
