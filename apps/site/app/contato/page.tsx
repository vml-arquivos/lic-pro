import { ContentPage } from '../../components/ContentPage';
import { LeadForm } from '../../components/LeadForm';

export const metadata = {
  title: 'Contato',
  description: 'Fale com o Licite Comigo sobre produto, lista de espera e mentoria.',
};
export default function ContactPage() {
  const whatsapp = process.env.WHATSAPP_NUMBER
    ? `https://wa.me/${process.env.WHATSAPP_NUMBER.replace(/\D/g, '')}`
    : '#lista-contato';
  return (
    <ContentPage
      eyebrow="Contato"
      title="Fale com a gente."
      intro="Para dúvidas sobre o produto, lista de espera ou mentoria, deixe seus dados. Responderemos conforme disponibilidade."
    >
      <a className="button button-secondary" href={whatsapp}>
        Abrir WhatsApp
      </a>
      <LeadForm id="lista-contato" />
    </ContentPage>
  );
}
