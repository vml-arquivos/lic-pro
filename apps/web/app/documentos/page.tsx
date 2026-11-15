import { DocumentosApp } from './DocumentosApp';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Documentos da empresa | Licite Comigo',
  description: 'Validade dos documentos de habilitação da sua empresa.',
};

export default function DocumentosPage() {
  return <DocumentosApp />;
}
