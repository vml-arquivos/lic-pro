'use client';

import {
  CRITERIOS_ANALISE,
  CRITERIOS_COMPATIBILIDADE,
  CRITERIOS_FOCOS,
  type FocoAnalise,
} from '@licitecomigo/shared';
import './criterios.css';

/** Critérios de cada resultado ("mais fáceis", "mais lucrativas"…), no mesmo texto que o cálculo usa. */
export function CriteriosAnalise({
  foco,
  aberto = false,
  titulo = 'Como a nota é calculada',
}: Readonly<{ foco?: FocoAnalise; aberto?: boolean; titulo?: string }>) {
  const focoAtual = foco ? CRITERIOS_FOCOS.find((item) => item.foco === foco) : undefined;
  return (
    <details className="cr" open={aberto}>
      <summary>{titulo}</summary>
      {focoAtual ? (
        <div className="cr-foco">
          <strong>{focoAtual.rotulo}</strong>
          <p>
            <b>Ordena por:</b> {focoAtual.ordena_por}
          </p>
        </div>
      ) : (
        <ul className="cr-focos">
          {CRITERIOS_FOCOS.map((item) => (
            <li key={item.foco}>
              <strong>{item.rotulo}</strong> — <b>Ordena por:</b> {item.ordena_por}
            </li>
          ))}
        </ul>
      )}
      <h4>Nota geral</h4>
      <ul className="cr-lista">
        {CRITERIOS_ANALISE.map((item) => (
          <li key={item.chave}>
            <div className="cr-topo">
              <strong>{item.rotulo}</strong>
              <span className="cr-peso">{item.peso_pct}%</span>
            </div>
            <ul>
              {item.como_pontua.map((regra) => (
                <li key={regra}>{regra}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <h4>Compatibilidade com o seu perfil</h4>
      <ul className="cr-compat">
        {CRITERIOS_COMPATIBILIDADE.map((item) => (
          <li key={item.chave}>
            <strong>{item.rotulo}</strong> ({item.pontos} pts): {item.regra}
          </li>
        ))}
      </ul>
    </details>
  );
}
