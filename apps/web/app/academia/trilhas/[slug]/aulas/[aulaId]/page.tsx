import { getSession } from '../../../../../../lib/session';
import { LessonView } from './LessonView';

export const dynamic = 'force-dynamic';

export default async function LessonPage({ params }: { params: { slug: string; aulaId: string } }) {
  const session = await getSession();
  return (
    <LessonView aulaId={params.aulaId} slug={params.slug} canTrack={session?.area === 'aluno'} />
  );
}
