import Link from 'next/link';
import { requireArea } from '../../../../lib/session';
import { AlunoDetalhe } from './AlunoDetalhe';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Aluno | Licite Comigo' };

export default async function AlunoPage({ params }: { params: { alunoId: string } }) {
  const session = await requireArea('administracao', 'mentor');
  return (
    <div className="ui-page">
      <Link className="back-link" href="/mentor">
        ← Meus alunos
      </Link>
      <AlunoDetalhe alunoId={params.alunoId} canEdit={session.area === 'mentor'} />
    </div>
  );
}
