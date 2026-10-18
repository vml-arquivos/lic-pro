import { ContentPage } from '../../components/ContentPage';
import { LeadForm } from '../../components/LeadForm';

export const metadata = {
  title: 'Mentoria',
  description:
    'Acompanhamento para estudar, praticar e organizar próximos passos em licitações públicas.',
};
export default function MentoringPage() {
  return (
    <ContentPage
      eyebrow="Mentoria de 30 dias"
      title="Um ciclo de acompanhamento, não uma promessa."
      intro="A mentoria pode ajudar a criar rotina, revisar dúvidas e organizar próximos passos. Resultado depende do contexto, da documentação e das decisões de cada participante."
    >
      <section>
        <h2>O que pode acontecer</h2>
        <ul>
          <li>Mapear seu ponto de partida.</li>
          <li>Escolher uma trilha de estudo e prática.</li>
          <li>Revisar um processo de busca e organização.</li>
          <li>Registrar dúvidas e aprendizados.</li>
        </ul>
      </section>
      <section className="callout">
        <h2>Quer saber quando abrir?</h2>
        <p>Deixe seu contato para receber informações, sem compromisso.</p>
        <LeadForm id="lista-mentoria" />
      </section>
    </ContentPage>
  );
}
