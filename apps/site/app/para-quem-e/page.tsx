import { ContentPage } from '../../components/ContentPage';

export default function AudiencePage() {
  return (
    <ContentPage
      eyebrow="Para quem é"
      title="O mesmo produto, três pontos de partida."
      intro="Cada pessoa chega com uma experiência diferente. O Licite Comigo organiza o caminho sem prometer o destino."
    >
      <section id="empresario">
        <h2>Empresário</h2>
        <p>
          Para quem precisa transformar editais, documentos e prazos em uma rotina verificável para
          sua equipe.
        </p>
      </section>
      <section id="mentorado">
        <h2>Mentorado</h2>
        <p>
          Para quem quer estudar, praticar e compartilhar contexto com um mentor por meio de
          concessões explícitas.
        </p>
      </section>
      <section id="iniciante">
        <h2>Iniciante</h2>
        <p>
          Para quem está conhecendo compras públicas e precisa de linguagem simples, glossário e uma
          próxima ação possível.
        </p>
      </section>
    </ContentPage>
  );
}
