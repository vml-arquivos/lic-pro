'use client';

/** Mostrada quando a pessoa está entrada em um endereço que não é do painel da sua conta. */
export function WrongPanel({ url }: Readonly<{ url: string | null }>) {
  async function signOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }
  return (
    <main className="ui-denied" role="alert">
      <p className="eyebrow">Painel diferente</p>
      <h1>Esta conta não é deste painel.</h1>
      <p>
        {url
          ? 'Cada tipo de conta tem o seu próprio endereço. Abra o painel da sua conta ou saia para entrar com outra.'
          : 'Saia para entrar com outra conta.'}
      </p>
      {url ? (
        <a className="ui-btn" href={url}>
          Ir para o meu painel
        </a>
      ) : null}{' '}
      <button type="button" className="ui-btn ui-btn-ghost" onClick={() => void signOut()}>
        Sair
      </button>
    </main>
  );
}
