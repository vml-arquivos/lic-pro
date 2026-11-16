'use client';

import { useEffect, useState } from 'react';
import { EVENTO_ESTADO_ANA, type EstadoAna } from '../ana/estado';

export function AnaAvatar({
  tamanho = 'lg',
  ativando = false,
}: Readonly<{ tamanho?: 'lg' | 'sm' | 'mini'; ativando?: boolean }>) {
  const [estado, setEstado] = useState<EstadoAna>('ocioso');

  useEffect(() => {
    function reagir(event: Event) {
      const { detail } = event as CustomEvent<EstadoAna>;
      setEstado(detail);
    }

    window.addEventListener(EVENTO_ESTADO_ANA, reagir);
    return () => window.removeEventListener(EVENTO_ESTADO_ANA, reagir);
  }, []);

  const estadoVisual = ativando ? 'ativando' : estado === 'falando' ? 'respondendo' : estado;

  return (
    <span
      className={`ana-avatar ana-avatar-${tamanho}`}
      data-estado={estadoVisual}
      aria-hidden="true"
    >
      <span className="ana-avatar-recorte">
        <img src="/ana/ana-retrato.webp" alt="" width={640} height={640} />
      </span>
    </span>
  );
}
