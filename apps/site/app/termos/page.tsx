import { ContentPage } from '../../components/ContentPage';

export default function TermsPage() {
  return (
    <ContentPage
      eyebrow="Termos de Uso"
      title="Rascunho para revisão jurídica."
      intro="Este texto é informativo e não constitui a versão final dos Termos de Uso."
    >
      <h2>Objeto</h2>
      <p>
        O Licite Comigo oferece ferramentas de apoio à busca, leitura e organização de
        oportunidades. O usuário permanece responsável por conferir fontes, prazos, documentos e
        decisões.
      </p>
      <h2>Limites</h2>
      <p>
        A plataforma não garante vitória, contratação, economia, lucro ou qualquer resultado. Não
        envia propostas, lances ou comandos a portais públicos.
      </p>
      <h2>Dados</h2>
      <p>
        O tratamento de dados pessoais deve ser lido junto da Política de Privacidade. A versão
        final será publicada após revisão jurídica.
      </p>
    </ContentPage>
  );
}
