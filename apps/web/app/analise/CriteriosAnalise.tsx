'use client';

import {
  AVISO_CRITERIOS,
  CRITERIOS_ANALISE,
  CRITERIOS_COMPATIBILIDADE,
  CRITERIOS_FOCOS,
  type FocoAnalise,
} from '@licitecomigo/shared';
import './criterios.css';

/**
 * Mostra quais critérios entram em cada resultado ("mais fáceis", "mais lucrativas"…).
 * O texto vem do pacote compartilhado, o mesmo que o cálculo usa, e os testes confirmam que bate.
 */
export function CriteriosAnalise({
  foco,
  aberto = false,
  titulo = 'Como as notas são calculadas',
}: Readonly<{ foco?: FocoAnalise; aberto?: boolean; titulo?: string }>) {
  const focoAtual = foco ? CRITERIOS_FOCOS.find((item) => item.foco === foco) : undefined;
  return (
    <details className="cr" open={aberto}>
      <summary>{titulo}</summary>
      {focoAtual ? (
        <div className="cr-foco">
          <strong>{focoAtual.rotulo}</strong>
          <p>{focoAtual.pergunta}</p>
          <p>
            <b>Ordena por:</b> {focoAtual.ordena_por}
          </p>
          <p>
            <b>Usa:</b> {focoAtual.usa.join(' · ')}
          </p>
          <p className="cr-obs">{focoAtual.observacao}</p>
        </div>
      ) : (
        <ul className="cr-focos">
          {CRITERIOS_FOCOS.map((item) => (
            <li key={item.foco}>
              <strong>{item.rotulo}</strong> — {item.pergunta} <b>Ordena por:</b> {item.ordena_por}
              <small>{item.observacao}</small>
            </li>
          ))}
        </ul>
      )}
      <h4>Critérios da nota geral</h4>
      <ul className="cr-lista">
        {CRITERIOS_ANALISE.map((item) => (
          <li key={item.chave}>
            <div className="cr-topo">
              <strong>{item.rotulo}</strong>
              <span className="cr-peso">{item.peso_pct}% da nota</span>
            </div>
            <p>{item.pergunta}</p>
            <ul>
              {item.como_pontua.map((regra) => (
                <li key={regra}>{regra}</li>
              ))}
            </ul>
            <small>Dados usados: {item.dados}</small>
          </li>
        ))}
      </ul>
      <h4>Compatibilidade com o seu perfil (Radar)</h4>
      <p className="cr-obs">
        Só contam os critérios que você preencheu no perfil; a nota é a porcentagem dos pontos
        possíveis.
      </p>
      <ul className="cr-compat">
        {CRITERIOS_COMPATIBILIDADE.map((item) => (
          <li key={item.chave}>
            <strong>{item.rotulo}</strong> ({item.pontos} pts): {item.regra}
          </li>
        ))}
      </ul>
      <p className="cr-obs">{AVISO_CRITERIOS}</p>
    </details>
  );
}
