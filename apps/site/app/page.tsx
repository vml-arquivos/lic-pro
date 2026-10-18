import Link from 'next/link';
import { LeadForm } from '../components/LeadForm';

const appUrl = process.env.APP_URL ?? '/';
const whatsapp = process.env.WHATSAPP_NUMBER
  ? `https://wa.me/${process.env.WHATSAPP_NUMBER.replace(/\D/g, '')}`
  : '/contato';

const faq = [
  {
    q: 'O Licite Comigo envia propostas ou lances?',
    a: 'Não. A plataforma organiza informação, documentos, prazos e decisões sob responsabilidade do usuário.',
  },
  {
    q: 'A leitura do edital substitui uma análise jurídica?',
    a: 'Não. A leitura ajuda a localizar informações e fontes. Dúvidas jurídicas devem ser avaliadas por um profissional habilitado.',
  },
  {
    q: 'Vocês prometem vencer uma licitação?',
    a: 'Não. O produto não promete vitória, contrato, lucro ou qualquer outro resultado.',
  },
];

export const metadata = {
  title: 'Licite Comigo | Organize licitações públicas',
  description:
    'Encontre oportunidades, confira editais e organize os próximos passos da sua empresa em licitações públicas.',
};

export default function HomePage() {
  const siteUrl = process.env.SITE_URL;
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Licite Comigo',
    url: siteUrl,
    description: 'Plataforma para encontrar, ler e organizar licitações públicas.',
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
          <p className="eyebrow">Licitações públicas</p>
          <h1>Encontre oportunidades. Leia o edital. Organize o próximo passo.</h1>
          <p className="hero-lead">
            Radar de oportunidades, leitura assistida com fontes e organização de prazos para
            empresas e profissionais que participam de compras públicas.
          </p>
          <div className="cta-row">
            <a className="button button-primary" href={appUrl}>
              Acessar a plataforma
            </a>
            <a className="button button-secondary" href={whatsapp}>
              Falar pelo WhatsApp
            </a>
          </div>
          <p className="legal-note">
            Ferramenta de apoio à decisão. Não é consultoria jurídica e não envia lances.
          </p>
        </div>
        <div className="hero-panel">
          <span className="panel-kicker">O que você encontra</span>
          <h2>Informação organizada para decidir melhor.</h2>
          <p>Menos procura espalhada. Mais clareza sobre o que conferir antes de participar.</p>
          <ul className="product-list">
            <li>Oportunidades com fonte original</li>
            <li>Trechos e prazos para conferência</li>
            <li>Empresas, documentos e próximos passos</li>
          </ul>
          <Link href="/recursos">Ver recursos →</Link>
        </div>
      </section>
      <section className="section-wrap" aria-labelledby="audience">
        <div className="section-heading">
          <p className="eyebrow">Para quem é</p>
          <h2 id="audience">Um ponto de partida para cada momento.</h2>
        </div>
        <div className="card-grid three">
          <Link className="info-card" href="/para-quem-e#empresario">
            <span className="card-number">01</span>
            <h3>Empresário</h3>
            <p>Organize oportunidades, dados da empresa, documentos e prazos para sua equipe.</p>
          </Link>
          <Link className="info-card" href="/para-quem-e#mentorado">
            <span className="card-number">02</span>
            <h3>Mentorado</h3>
            <p>Estude uma trilha e compartilhe contexto com seu mentor mediante concessão.</p>
          </Link>
          <Link className="info-card" href="/para-quem-e#iniciante">
            <span className="card-number">03</span>
            <h3>Quem está começando</h3>
            <p>Aprenda termos e fundamentos com explicações simples e fontes para conferir.</p>
          </Link>
        </div>
      </section>
      <section className="section-wrap tinted" aria-labelledby="resources">
        <div className="section-heading">
          <p className="eyebrow">Como funciona</p>
          <h2 id="resources">Três passos para sair da busca e chegar à decisão.</h2>
        </div>
        <div className="steps">
          <div>
            <b>1</b>
            <h3>Encontre</h3>
            <p>Pesquise oportunidades por assunto, localidade e modalidade.</p>
          </div>
          <div>
            <b>2</b>
            <h3>Confira</h3>
            <p>Leia o edital, veja a fonte original e separe o que está confirmado.</p>
          </div>
          <div>
            <b>3</b>
            <h3>Organize</h3>
            <p>Registre documentos, prazos e a próxima ação da sua empresa.</p>
          </div>
        </div>
      </section>
      <section className="section-wrap lead-section" id="lista-de-espera">
        <div>
          <p className="eyebrow">Próxima abertura</p>
          <h2>Receba novidades quando houver uma nova etapa.</h2>
          <p>
            Conte seu momento. Usaremos seus dados apenas para responder e comunicar novidades, com
            consentimento.
          </p>
        </div>
        <LeadForm />
      </section>
      <section className="section-wrap faq-section" aria-labelledby="faq">
        <p className="eyebrow">Perguntas frequentes</p>
        <h2 id="faq">Transparência antes de começar.</h2>
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
