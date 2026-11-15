import Link from 'next/link';
import { requireArea } from '../../../lib/session';
import { MaterialLeitura } from './MaterialLeitura';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Material | Licite Comigo' };

export default async function MaterialPage({ params }: Readonly<{ params: { id: string } }>) {
  await requireArea('administracao', 'curso', 'aluno', 'mentor');
  return (
    <div className="ui-page">
      <Link className="back-link" href="/materiais">
        ← Materiais
      </Link>
      <MaterialLeitura id={params.id} />
    </div>
  );
}
