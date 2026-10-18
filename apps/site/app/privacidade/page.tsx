import { ContentPage } from '../../components/ContentPage';

export const metadata = {
  title: 'Política de privacidade',
  description:
    'Como o Licite Comigo usa os dados enviados à plataforma e aos formulários públicos.',
};

export default function PrivacyPage() {
  return (
    <ContentPage
      eyebrow="Privacidade"
      title="Como tratamos seus dados."
      intro="Este documento explica os dados recebidos, as finalidades de uso e os canais de atendimento."
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
      <p>
        Para solicitar acesso, correção ou exclusão, use o canal de contato publicado neste site.
      </p>
    </ContentPage>
  );
}
