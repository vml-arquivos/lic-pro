import { CancelarAlertas } from './CancelarAlertas';

export const metadata = {
  title: 'Cancelar e-mails de alerta | Licite Comigo',
  robots: { index: false },
};

export default function CancelarAlertasPage({
  searchParams,
}: Readonly<{ searchParams: { token?: string } }>) {
  return (
    <div className="ui-page" style={{ maxWidth: '34rem', margin: '3rem auto' }}>
      <CancelarAlertas token={searchParams.token ?? ''} />
    </div>
  );
}
