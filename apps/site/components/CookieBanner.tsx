'use client';

import { useEffect, useState } from 'react';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(window.localStorage.getItem('lc-cookie-consent') !== 'accepted'), []);
  if (!visible) return null;
  return (
    <aside className="cookie-banner" role="dialog" aria-label="Preferências de cookies">
      <p>
        Usamos apenas cookies necessários por padrão. Analytics opcional só será ativado após seu
        consentimento.
      </p>
      <div>
        <button
          className="button button-primary"
          onClick={() => {
            window.localStorage.setItem('lc-cookie-consent', 'accepted');
            setVisible(false);
          }}
        >
          Aceitar opcionais
        </button>
        <button
          className="button button-quiet"
          onClick={() => {
            window.localStorage.setItem('lc-cookie-consent', 'necessary');
            setVisible(false);
          }}
        >
          Somente necessários
        </button>
      </div>
    </aside>
  );
}
