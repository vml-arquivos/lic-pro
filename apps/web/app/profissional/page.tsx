import { redirect } from 'next/navigation';

// Página antiga. Cada área agora tem o seu painel em /painel.
export default function LegacyPage() {
  redirect('/painel');
}
