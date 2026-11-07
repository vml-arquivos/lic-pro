import { redirect } from 'next/navigation';
import { getSessionResult } from '../lib/session';
import { HomeWorkspace } from './workspace/HomeWorkspace';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Licite Comigo',
  description: 'Acesse o seu painel no Licite Comigo.',
};

export default async function HomePage() {
  if (process.env.DEMO_MODE === 'true') return <HomeWorkspace demoMode />;
  const result = await getSessionResult();
  if (result.status === 'ok') {
    redirect(result.session.area === 'administracao' ? '/admin' : '/painel');
  }
  redirect('/login');
}
