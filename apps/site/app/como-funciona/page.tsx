import { ContentPage } from '../../components/ContentPage';

export default function HowPage() {
  return (
    <ContentPage
      eyebrow="Como funciona"
      title="Uma sequência curta para decisões mais claras."
      intro="Você mantém a decisão. A plataforma reduz o trabalho de encontrar, entender e organizar o que importa."
    >
      <ol className="numbered-list">
        <li>
          <h2>Encontre no Radar</h2>
          <p>Filtre oportunidades e confira a fonte oficial antes de salvar.</p>
        </li>
        <li>
          <h2>Leia com evidências</h2>
          <p>Envie o edital, receba uma leitura de apoio e valide página, trecho e contexto.</p>
        </li>
        <li>
          <h2>Organize a execução</h2>
          <p>Use pipeline, checklists, prazos e tarefas. Nenhum lance é enviado automaticamente.</p>
        </li>
      </ol>
    </ContentPage>
  );
}
