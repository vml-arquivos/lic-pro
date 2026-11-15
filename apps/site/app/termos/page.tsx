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
      <h2>Planos, cobrança e cancelamento</h2>
      <p>
        As assinaturas são cobradas por Pix, boleto ou cartão, por meio de um meio de pagamento
        parceiro. Não há fidelidade: você pode cancelar quando quiser e novas cobranças deixam de
        ser feitas. O teste grátis, quando oferecido, não pede cartão e termina sozinho no fim do
        prazo. Preços e limites de cada plano ficam na página de planos e podem mudar para novas
        contratações.
      </p>
      <h2>Curso</h2>
      <p>
        O acesso ao curso é liberado depois da confirmação do pagamento. Compras feitas pela
        internet por pessoa física podem ser desfeitas em até 7 dias, nos termos do art. 49 do
        Código de Defesa do Consumidor; para isso, use o canal de contato. O CPF ou CNPJ informado
        na compra vai apenas ao meio de pagamento; guardamos somente os quatro últimos dígitos.
      </p>
      <h2>Dados</h2>
      <p>
        O tratamento de dados pessoais deve ser lido junto da Política de Privacidade publicada
        neste site.
      </p>
    </ContentPage>
  );
}
