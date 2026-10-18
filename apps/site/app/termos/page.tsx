import { ContentPage } from '../../components/ContentPage';

export const metadata = {
  title: 'Termos de uso',
  description: 'Regras de uso da plataforma Licite Comigo e limites dos recursos oferecidos.',
};

export default function TermsPage() {
  return (
    <ContentPage
      eyebrow="Termos de Uso"
      title="Regras claras para usar a plataforma."
      intro="Conheça o que o Licite Comigo oferece e quais responsabilidades permanecem com cada usuário."
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
        O tratamento de dados pessoais deve ser lido junto da Política de Privacidade publicada
        neste site.
      </p>
    </ContentPage>
  );
}
