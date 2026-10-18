import { ProtectedRemoteDashboard } from '../components/ProtectedRemoteDashboard';

export const metadata = {
  title: 'Admin | Licite Comigo',
  description: 'Operação e governança protegidas do Licite Comigo.',
};

export default function AdminPage() {
  return <ProtectedRemoteDashboard kind="admin" />;
}
