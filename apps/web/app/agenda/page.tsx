import { AgendaApp } from './AgendaApp';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Agenda | Licite Comigo',
  description: 'Prazos de editais, tarefas e lembretes da sua empresa.',
};

export default function AgendaPage() {
  return <AgendaApp />;
}
