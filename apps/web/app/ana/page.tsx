import Link from 'next/link';

export const metadata = {
  title: 'Ana | Licite Comigo',
  description: 'Assistente de leitura e organização do Licite Comigo.',
};

export default function AnaPage() {
  return (
    <main className="academy-page ana-page">
      <Link className="back-link" href="/">
        ← Licite Comigo
      </Link>
      <div className="page-heading">
        <p className="eyebrow">Assistente Ana</p>
        <h1>Organize sua próxima pergunta.</h1>
        <p>
          Pergunte sobre conceitos, resultados do Reader ou como começar uma busca. Ana mostra
          limites e evidências, sem substituir o edital ou uma análise profissional.
        </p>
      </div>
      <section className="detail-card">
        <h2>Como Ana pode ajudar agora</h2>
        <p>
          Use o botão flutuante para iniciar uma conversa. A conexão de streaming é configurada por
          `NEXT_PUBLIC_AI_API_URL`.
        </p>
      </section>
    </main>
  );
}
