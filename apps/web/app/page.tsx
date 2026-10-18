import { HomeWorkspace } from './workspace/HomeWorkspace';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Início | Licite Comigo',
  description: 'Organize oportunidades, empresas e próximos passos em licitações públicas.',
};

export default function HomePage() {
  return <HomeWorkspace demoMode={process.env.DEMO_MODE === 'true'} />;
}
