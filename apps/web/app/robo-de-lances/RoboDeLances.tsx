'use client';

import { useMemo, useState } from 'react';
import { reais } from '../../lib/money';
import { Alert, Empty, Kpi, Panel, Table } from '../components/ui';
import { calcularPiso, planoDeLances, proximoLance, validarPlano } from './robo-lib';

const numero = (texto: string): number => {
  const limpo = texto.replace(/\./g, '').replace(',', '.').trim();
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : 0;
};

export function RoboDeLances() {
  const [custo, setCusto] = useState('');
  const [margem, setMargem] = useState('10');
  const [referencia, setReferencia] = useState('');
  const [inicial, setInicial] = useState('');
  const [decremento, setDecremento] = useState('');
  const [mercado, setMercado] = useState('');

  const entrada = useMemo(
    () => ({
      custo: numero(custo),
      margemMinima: numero(margem),
      inicial: numero(inicial),
      decremento: numero(decremento),
      referencia: numero(referencia) || null,
    }),
    [custo, margem, inicial, decremento, referencia],
  );
  const preenchido = Boolean(custo && inicial && decremento);
  const erros = preenchido ? validarPlano(entrada) : [];
  const piso = entrada.custo > 0 ? calcularPiso(entrada.custo, entrada.margemMinima) : null;
  const plano = useMemo(() => (preenchido ? planoDeLances(entrada) : []), [preenchido, entrada]);
  const melhor = numero(mercado);
  const proximo =
    melhor > 0 && entrada.custo > 0 && entrada.decremento > 0
      ? proximoLance(melhor, entrada)
      : null;
  const abaixoDaReferencia =
    entrada.referencia && entrada.inicial > entrada.referencia ? 'acima' : null;

  return (
    <>
      <Panel title="Dados da disputa">
        <div className="ui-form robo-form">
          <label>
            Custo total (R$)
            <input
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
            />
          </label>
          <label>
            Lucro mínimo (% sobre o custo)
            <input value={margem} onChange={(e) => setMargem(e.target.value)} inputMode="decimal" />
          </label>
          <label>
            Valor de referência do edital (R$)
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              inputMode="decimal"
              placeholder="Opcional"
            />
          </label>
          <label>
            Primeiro lance (R$)
            <input
              value={inicial}
              onChange={(e) => setInicial(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
            />
          </label>
          <label>
            Decremento por lance (R$)
            <input
              value={decremento}
              onChange={(e) => setDecremento(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
            />
          </label>
        </div>
        {erros.length ? (
          <Alert kind="error">{erros.map((erro) => erro.mensagem).join(' ')}</Alert>
        ) : null}
        {abaixoDaReferencia ? (
          <Alert kind="info">O primeiro lance está acima do valor de referência do edital.</Alert>
        ) : null}
      </Panel>

      <div className="ui-kpis robo-kpis">
        <Kpi label="Piso" value={piso !== null ? reais(piso) : '—'} hint="Menor valor com lucro" />
        <Kpi label="Lances até o piso" value={plano.length || '—'} />
        <Kpi
          label="Lucro no 1º lance"
          value={plano[0] ? reais(plano[0].lucro) : '—'}
          hint={plano[0] ? `${plano[0].margem.toLocaleString('pt-BR')}% sobre o custo` : undefined}
        />
      </div>

      <Panel title="Próximo lance">
        <div className="ui-form robo-form">
          <label>
            Melhor lance do mercado agora (R$)
            <input
              value={mercado}
              onChange={(e) => setMercado(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
            />
          </label>
        </div>
        {proximo?.tipo === 'dar' ? (
          <p className="robo-resposta robo-ok">
            Dê <strong>{reais(proximo.valor)}</strong> · lucro {reais(proximo.lucro)} (
            {proximo.margem.toLocaleString('pt-BR')}%)
          </p>
        ) : null}
        {proximo?.tipo === 'no_piso' ? (
          <p className="robo-resposta robo-atencao">
            Só dá para cobrir no piso: <strong>{reais(proximo.valor)}</strong> · lucro{' '}
            {reais(proximo.lucro)} ({proximo.margem.toLocaleString('pt-BR')}%)
          </p>
        ) : null}
        {proximo?.tipo === 'parar' ? (
          <p className="robo-resposta robo-parar">
            Pare. O mercado já está no piso de {reais(proximo.piso)} ou abaixo.
          </p>
        ) : null}
      </Panel>

      <Panel title="Sequência de lances">
        {plano.length ? (
          <Table head={['Lance', 'Valor', 'Lucro', 'Sobre o custo']} label="Sequência de lances">
            {plano.map((lance) => (
              <tr key={lance.ordem}>
                <td>{lance.ordem}º</td>
                <td>{reais(lance.valor)}</td>
                <td>{reais(lance.lucro)}</td>
                <td>{lance.margem.toLocaleString('pt-BR')}%</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>
            {preenchido && !erros.length
              ? 'O primeiro lance já está abaixo do piso.'
              : 'Preencha os dados acima.'}
          </Empty>
        )}
      </Panel>
    </>
  );
}
