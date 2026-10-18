import { ContentPage } from '../../components/ContentPage';

export default function PrivacyPage() {
  return (
    <ContentPage
      eyebrow="Privacidade"
      title="Rascunho para revisão jurídica."
      intro="Este texto resume fluxos previstos e não substitui a Política de Privacidade final."
    >
      <h2>Dados coletados</h2>
      <p>
        Podemos receber dados de conta, empresa, documentos enviados ao Reader, registros de uso e
        leads enviados com consentimento.
      </p>
      <h2>Finalidades</h2>
      <p>
        Usamos dados para autenticar, isolar empresas, prestar os recursos solicitados, responder
        contatos e melhorar segurança. Não vendemos dados pessoais.
      </p>
      <h2>Direitos e retenção</h2>
      <p>
        Pedidos de acesso, correção ou exclusão serão tratados pelos canais configurados. A retenção
        é limitada ao necessário e pode variar conforme obrigação legal e auditoria.
      </p>
      <p>Consulte o responsável pelo tratamento quando o canal oficial estiver publicado.</p>
    </ContentPage>
  );
}
