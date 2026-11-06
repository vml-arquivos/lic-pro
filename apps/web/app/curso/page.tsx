import Link from 'next/link';
import { loadPublicPlans } from '../../lib/public-plans';
import { brl } from '../../lib/money';
import { CursoCheckout } from './CursoCheckout';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Curso | Licite Comigo',
  description:
    'Aprenda a vender para o governo com trilhas, prática em edital real e mentoria de quem trabalha com licitações.',
};

export default async function CursoPage() {
  const { vendasAtivas, planos } = await loadPublicPlans();
  const curso = planos.find((plano) => plano.tipo === 'curso') ?? null;

  return (
    <main className="shop">
      <section className="shop-hero">
        <p className="eyebrow">Curso Licite Comigo</p>
        <h1>
          Aprenda a vender para o governo,{' '}
          <span className="hub-grad">com quem faz licitação de verdade.</span>
        </h1>
        <p>
          Trilhas de aulas, prática em edital real, plano de 30 dias e devolutivas da mentora. Ao
          concluir, você já sabe achar, entender e disputar oportunidades.
        </p>
      </section>

      {curso && vendasAtivas ? (
        <section className="shop-grid">
          <article className="plan plan-featured">
            <h2>{curso.nome}</h2>
            <p className="plan-desc">{curso.descricao}</p>
            <p className="plan-price">
              <strong>{brl(curso.preco_centavos)}</strong>
              <small>pagamento único</small>
            </p>
            <ul className="plan-list">
              {curso.beneficios.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="plan-note">
              Pague com Pix, boleto ou cartão. O acesso é liberado assim que o pagamento é
              confirmado.
            </p>
          </article>
          <CursoCheckout plano={curso.slug} />
        </section>
      ) : (
        <section className="shop-closed">
          <h2>As matrículas abrem em breve</h2>
          <p>Ainda não há turma à venda. Já tem convite da equipe? Entre com a sua conta.</p>
          <Link className="ui-btn" href="/login">
            Entrar
          </Link>
        </section>
      )}
    </main>
  );
}
