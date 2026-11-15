import { GUIA_DE_VALORES } from '../analise/analise-lib';

/**
 * "Como ler os valores": cada número vem de uma etapa diferente da contratação. Deixa claro que
 * estimado, homologado e contrato não são dinheiro pago.
 */
export function GuiaDeValores() {
  return (
    <details className="ui-guia">
      <summary>Como ler os valores (estimado, homologado, contrato, pagamento)</summary>
      <dl>
        {GUIA_DE_VALORES.map(([termo, texto]) => (
          <div key={termo}>
            <dt>{termo}</dt>
            <dd>{texto}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
