import Link from 'next/link';
import { LeadForm } from '../components/LeadForm';

const appUrl = process.env.APP_URL ?? '/';
const whatsapp = process.env.WHATSAPP_NUMBER
  ? `https://wa.me/${process.env.WHATSAPP_NUMBER.replace(/\D/g, '')}`
  : '/contato';

export default function HomePage() {
  const slogan = process.env.BRAND_SLOGAN ?? 'Clareza para decidir o próximo passo';
  const faq = [
    {
      q: 'O Licite Comigo envia propostas ou lances?',
      a: 'Não. O produto organiza informação, documentos, prazos e decisões sob responsabilidade do usuário.',
    },
    {
      q: 'A análise do edital substitui um advogado?',
      a: 'Não. O Reader é uma leitura de apoio com fontes e evidências; não é conclusão jurídica.',
    },
    {
      q: 'Existem resultados garantidos?',
      a: 'Não. Não prometemos vitória, contrato, lucro ou qualquer resultado.',
    },
  ];
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Licite Comigo',
    url: process.env.SITE_URL ?? '',
    description: slogan,
  };
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <section className="hero section-wrap">
        <div className="hero-copy">
          <p className="eyebrow">Licitações públicas com mais clareza</p>
          <h1>{slogan}</h1>
          <p className="hero-lead">
            Radar, leitura de editais com fontes, formação e organização de prazos em um só lugar —
            sem promessas de resultado e sem automação de lances.
          </p>
          <div className="cta-row">
            <a className="button button-primary" href={appUrl}>
              Entrar no app
            </a>
            <a className="button button-secondary" href={whatsapp}>
              Falar pelo WhatsApp
            </a>
          </div>
          <p className="legal-note">Ferramenta de apoio à decisão. Não é consultoria jurídica.</p>
        </div>
        <div className="hero-panel">
          <span className="panel-kicker">ANA recomenda</span>
          <h2>Comece pelo próximo passo que você consegue verificar.</h2>
          <p>Ana pode explicar conceitos e apontar fontes, sempre em modo somente leitura.</p>
          <Link href="/recursos">Conhecer recursos →</Link>
        </div>
      </section>
      <section className="section-wrap" aria-labelledby="audience">
        <div className="section-heading">
          <p className="eyebrow">Para quem é</p>
          <h2 id="audience">Uma jornada que se adapta ao seu momento</h2>
        </div>
        <div className="card-grid three">
          <Link className="info-card" href="/para-quem-e#empresario">
            <span className="card-number">01</span>
            <h3>Empresário</h3>
            <p>Organize oportunidades, equipe, documentos e prazos antes de decidir.</p>
          </Link>
          <Link className="info-card" href="/para-quem-e#mentorado">
            <span className="card-number">02</span>
            <h3>Mentorado</h3>
            <p>Estude com uma trilha e compartilhe contexto com seu mentor mediante concessão.</p>
          </Link>
          <Link className="info-card" href="/para-quem-e#iniciante">
            <span className="card-number">03</span>
            <h3>Iniciante</h3>
            <p>
              Aprenda termos e fundamentos com explicações simples e conteúdo em revisão editorial.
            </p>
          </Link>
        </div>
      </section>
      <section className="section-wrap tinted" aria-labelledby="resources">
        <div className="section-heading">
          <p className="eyebrow">Como funciona</p>
          <h2 id="resources">Três passos, sem atalhos escondidos</h2>
        </div>
        <div className="steps">
          <div>
            <b>1</b>
            <h3>Encontre</h3>
            <p>Consulte oportunidades a partir de fontes oficiais documentadas.</p>
          </div>
          <div>
            <b>2</b>
            <h3>Entenda</h3>
            <p>Leia o edital com trechos, páginas e evidências para validar.</p>
          </div>
          <div>
            <b>3</b>
            <h3>Organize</h3>
            <p>Salve a oportunidade, acompanhe prazos e registre sua decisão.</p>
          </div>
        </div>
      </section>
      <section className="section-wrap lead-section">
        <div>
          <p className="eyebrow">Próxima abertura</p>
          <h2>Receba novidades sem compromisso</h2>
          <p>
            Conte seu momento. Usaremos seus dados apenas para responder e comunicar novidades, com
            consentimento.
          </p>
        </div>
        <LeadForm />
      </section>
      <section className="section-wrap faq-section" aria-labelledby="faq">
        <p className="eyebrow">Perguntas frequentes</p>
        <h2 id="faq">Transparência antes da conversão</h2>
        <div className="faq-list">
          {faq.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
        <Link className="text-link" href="/faq">
          Ver todas as perguntas →
        </Link>
      </section>
    </>
  );
}
