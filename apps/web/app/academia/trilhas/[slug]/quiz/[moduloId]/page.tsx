import { getSession } from '../../../../../../lib/session';
import { QuizView } from './QuizView';

export const dynamic = 'force-dynamic';

export default async function QuizPage({ params }: { params: { slug: string; moduloId: string } }) {
  const session = await getSession();
  return (
    <QuizView moduloId={params.moduloId} slug={params.slug} canAnswer={session?.area === 'aluno'} />
  );
}
