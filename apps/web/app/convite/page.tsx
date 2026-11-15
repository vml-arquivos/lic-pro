import { InviteAccept } from './InviteAccept';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Convite | Licite Comigo',
  description: 'Crie sua conta a partir do convite recebido.',
  robots: { index: false, follow: false },
};

export default function InvitePage() {
  return (
    <main className="invite-page">
      <InviteAccept />
    </main>
  );
}
