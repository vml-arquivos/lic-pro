import { ContentPage } from '../../components/ContentPage';

export default function PlansPage() {
  return (
    <ContentPage
      eyebrow="Planos"
      title="Planos em definição."
      intro="Estamos validando limites, suporte e custos antes de publicar preços. Não há cobrança nesta página."
    >
      <section className="plan-placeholder">
        <h2>Em breve</h2>
        <p>
          Quando os planos estiverem definidos, esta página explicará o que está incluído, os
          limites de uso e as condições de cancelamento com clareza.
        </p>
      </section>
    </ContentPage>
  );
}
