import { AccountSettings } from './AccountSettings';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Minha conta | Licite Comigo',
  description: 'Dados, segurança e painéis autorizados da conta Licite Comigo.',
};

export default function AccountPage() {
  return <AccountSettings />;
}
