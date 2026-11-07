import Link from 'next/link';
import { ContentPage } from '../../components/ContentPage';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Planos e preços',
  description:
    'Curso e assinaturas do Licite Comigo: preços claros, teste grátis e cancelamento quando quiser.',
};

type Plan = {
  slug: string;
  nome: string;
  descricao: string;
  tipo: 'assinatura' | 'curso';
  preco_centavos: number;
  ciclo: 'mensal' | 'anual' | 'unico';
  beneficios: string[];
  trial_dias: number;
};

async function loadPlans(): Promise<Plan[]> {
  const base = process.env.CORE_API_INTERNAL_URL?.replace(/\/$/, '');
  if (!base) return [];
  try {
    const response = await fetch(`${base}/public/planos`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    return ((await response.json()) as { planos?: Plan[] }).planos ?? [];
  } catch {
    return [];
  }
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const CYCLE = { mensal: 'por mês', anual: 'por ano', unico: 'pagamento único' } as const;

const FAQ: Array<[string, string]> = [
  [
    'Preciso de cartão para testar?',
    'Não. O teste grátis começa dentro da sua conta, sem cartão, e termina sozinho no fim do prazo. Seus dados continuam guardados.',
  ],
  [
    'Posso cancelar quando quiser?',
    'Sim. Não há fidelidade. Ao cancelar, novas cobranças deixam de ser feitas.',
  ],
  [
    'Como pago?',
    'Por Pix, boleto ou cartão, em um ambiente do meio de pagamento. Não guardamos o número do seu cartão nem o seu CPF/CNPJ completo.',
  ],
  [
    'De onde vêm os editais?',
    'Do Portal Nacional de Contratações Públicas (PNCP), a fonte oficial da Lei 14.133. Sempre confira o edital na origem antes de decidir.',
  ],
  [
    'Vocês garantem que eu vou ganhar licitações?',
    'Não. O Licite Comigo ajuda a achar, entender e organizar oportunidades. A decisão e o preço da proposta são seus.',
  ],
];

export default async function PlansPage() {
  const plans = await loadPlans();
  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
  const signup = process.env.SIGNUP_ENABLED === 'true' ? `${appUrl}/signup` : appUrl || '/';
  const subscriptions = plans.filter((plan) => plan.tipo === 'assinatura');
  const course = plans.find((plan) => plan.tipo === 'curso');
  const rows = [...new Set(subscriptions.flatMap((plan) => plan.beneficios))];

  return (
    <ContentPage
      eyebrow="Planos"
      title="Preço claro, teste grátis e sem fidelidade."
      intro="Escolha entre acompanhar licitações com o seu plano ou aprender a vender ao governo com o curso."
    >
      {plans.length === 0 ? (
        <section className="plan-placeholder">
          <h2>Em breve</h2>
          <p>
            Os planos serão publicados aqui, com preço, limites e condições de cancelamento. Quer
            ser avisado? Fale com a gente pelo <Link href="/contato">contato</Link>.
          </p>
        </section>
      ) : (
        <>
          <section className="pricing-grid" aria-label="Planos">
            {subscriptions.map((plan, index) => (
              <article
                className={`pricing-card ${index === subscriptions.length - 1 && subscriptions.length > 1 ? 'pricing-featured' : ''}`}
                key={plan.slug}
              >
                <h2>{plan.nome}</h2>
                <p>{plan.descricao}</p>
                <p className="pricing-price">
                  <strong>{brl(plan.preco_centavos)}</strong> <small>{CYCLE[plan.ciclo]}</small>
                </p>
                <ul>
                  {plan.beneficios.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <a className="button button-primary" href={`${signup}`}>
                  {plan.trial_dias > 0
                    ? `Testar grátis por ${plan.trial_dias} dias`
                    : 'Criar conta'}
                </a>
              </article>
            ))}
            {course ? (
              <article className="pricing-card">
                <h2>{course.nome}</h2>
                <p>{course.descricao}</p>
                <p className="pricing-price">
                  <strong>{brl(course.preco_centavos)}</strong> <small>{CYCLE[course.ciclo]}</small>
                </p>
                <ul>
                  {course.beneficios.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <a className="button button-secondary" href={`${appUrl}/curso`}>
                  Quero o curso
                </a>
              </article>
            ) : null}
          </section>

          {subscriptions.length > 1 && rows.length > 0 ? (
            <section aria-label="Comparação dos planos">
              <h2>Compare os planos</h2>
              <div className="compare-wrap">
                <table className="compare">
                  <thead>
                    <tr>
                      <th scope="col">O que inclui</th>
                      {subscriptions.map((plan) => (
                        <th scope="col" key={plan.slug}>
                          {plan.nome}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row}>
                        <th scope="row">{row}</th>
                        {subscriptions.map((plan) => (
                          <td key={plan.slug}>
                            {plan.beneficios.includes(row) ? (
                              <span aria-label="Incluído">✓</span>
                            ) : (
                              <span aria-label="Não incluído">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section aria-label="Perguntas sobre planos">
            <h2>Perguntas rápidas</h2>
            {FAQ.map(([question, answer]) => (
              <details className="faq-item" key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
            <p>
              Mais detalhes nos <Link href="/termos">Termos de uso</Link> e na{' '}
              <Link href="/privacidade">Política de privacidade</Link>.
            </p>
          </section>
        </>
      )}
    </ContentPage>
  );
}
