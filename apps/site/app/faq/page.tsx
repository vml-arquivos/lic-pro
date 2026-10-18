import { ContentPage } from '../../components/ContentPage';

const questions = [
  [
    'O produto é consultoria jurídica?',
    'Não. É uma ferramenta de apoio e formação. Valide documentos e decisões com profissionais adequados.',
  ],
  [
    'A Ana pode enviar lances?',
    'Não. A Ana é somente leitura no escopo atual e não opera portais.',
  ],
  [
    'Vocês prometem ganhar licitações?',
    'Não. Não há promessa de vitória, lucro, contrato ou resultado.',
  ],
  [
    'Quais fontes o Radar usa?',
    'O projeto documenta conectores oficiais, incluindo PNCP e Compras.gov.br. Confira sempre a fonte de origem.',
  ],
  [
    'Posso cancelar?',
    'Os planos ainda estão em definição; as condições serão publicadas antes de qualquer cobrança.',
  ],
];
export default function FaqPage() {
  return (
    <ContentPage
      eyebrow="FAQ"
      title="Perguntas diretas, respostas honestas."
      intro="Se uma resposta depender do seu caso, a página dirá isso."
    >
      <div className="faq-list">
        {questions.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </ContentPage>
  );
}
