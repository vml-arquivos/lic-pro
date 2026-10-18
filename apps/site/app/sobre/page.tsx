import { ContentPage } from '../../components/ContentPage';

export default function AboutPage() {
  return (
    <ContentPage
      eyebrow="Sobre"
      title="Tecnologia para tornar o próximo passo verificável."
      intro="O Licite Comigo combina Radar, formação e organização de operação para apoiar pessoas e empresas que participam de compras públicas brasileiras."
    >
      <p>
        O produto está sendo construído com isolamento multi-tenant, fontes oficiais, evidências e
        controles de segurança. A plataforma não substitui a análise humana, orientação jurídica ou
        decisão empresarial.
      </p>
      <p>
        Não publicamos depoimentos, logos, prêmios ou números sem fonte e autorização. Esta é uma
        escolha de produto, não uma falta de promessa.
      </p>
    </ContentPage>
  );
}
