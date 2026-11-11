'use client';

import { useEffect, useMemo, useState } from 'react';
import { simularProposta } from '@licitecomigo/shared';
import { Alert, Kpi } from '../components/ui';
import { moeda2 } from './analise-lib';

/** Taxas públicas das plataformas de disputa (referência de 11/11/2026; confirme no plano vigente). */
const PLATAFORMAS = {
  nenhuma: { rotulo: 'Nenhuma / não sei', pct: '0', teto: '', fixa: '0', dica: '' },
  bll: {
    rotulo: 'BLL Compras — taxa de êxito',
    pct: '1,5',
    teto: '600',
    fixa: '0',
    dica: 'BLL sem mensalidade: 1,5% sobre o vencido, no máximo R$ 600 por lote.',
  },
  pcp: {
    rotulo: 'Portal de Compras Públicas — crédito por processo',
    pct: '0',
    teto: '',
    fixa: '129',
    dica: 'R$ 129 por processo. Com plano mensal (R$ 165) ou anual (R$ 1.650), deixe em zero e some o plano nos outros custos.',
  },
  outra: { rotulo: 'Outra (informar)', pct: '0', teto: '', fixa: '0', dica: '' },
} as const;
type ChavePlataforma = keyof typeof PLATAFORMAS;

export type SimulacaoInicial = { titulo: string; preco_referencia: number | null };

const numero = (value: string): number => {
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};
const opcional = (value: string): number | null => (value.trim() === '' ? null : numero(value));

function Campo({
  rotulo,
  valor,
  onChange,
  ajuda,
  sufixo,
}: Readonly<{
  rotulo: string;
  valor: string;
  onChange: (value: string) => void;
  ajuda?: string;
  sufixo?: string;
}>) {
  return (
    <label>
      {rotulo}
      <span className="an-campo">
        <input
          inputMode="decimal"
          value={valor}
          onChange={(event) => onChange(event.target.value.replace(/[^\d.,]/g, ''))}
        />
        {sufixo ? <em>{sufixo}</em> : null}
      </span>
      {ajuda ? <small>{ajuda}</small> : null}
    </label>
  );
}

/**
 * Simulador de proposta: quanto custa entregar, qual o menor preço que ainda dá a margem que
 * você quer e o que acontece com o lucro em cada desconto. O cálculo é o mesmo da API.
 */
export function Simulador({ inicial }: Readonly<{ inicial: SimulacaoInicial | null }>) {
  const [quantidade, setQuantidade] = useState('1');
  const [custo, setCusto] = useState('');
  const [frete, setFrete] = useState('0');
  const [outros, setOutros] = useState('0');
  const [impostos, setImpostos] = useState('6');
  const [comissao, setComissao] = useState('0');
  const [margemMin, setMargemMin] = useState('10');
  const [referencia, setReferencia] = useState('');
  const [mercado, setMercado] = useState('');
  const [plataforma, setPlataforma] = useState<ChavePlataforma>('nenhuma');
  const [taxaPct, setTaxaPct] = useState('0');
  const [taxaTeto, setTaxaTeto] = useState('');
  const [taxaFixa, setTaxaFixa] = useState('0');

  function escolherPlataforma(chave: ChavePlataforma) {
    setPlataforma(chave);
    if (chave === 'outra') return;
    setTaxaPct(PLATAFORMAS[chave].pct);
    setTaxaTeto(PLATAFORMAS[chave].teto);
    setTaxaFixa(PLATAFORMAS[chave].fixa);
  }

  useEffect(() => {
    if (inicial?.preco_referencia) {
      setQuantidade('1');
      setReferencia(String(inicial.preco_referencia).replace('.', ','));
    }
  }, [inicial]);

  const resultado = useMemo(
    () =>
      simularProposta({
        quantidade: numero(quantidade),
        custo_unitario: numero(custo),
        frete_total: numero(frete),
        outros_custos_total: numero(outros),
        impostos_pct: Math.min(100, numero(impostos)),
        comissao_pct: Math.min(100, numero(comissao)),
        margem_minima_pct: Math.min(100, numero(margemMin)),
        preco_referencia: opcional(referencia),
        preco_mercado: opcional(mercado),
        taxa_plataforma_pct: Math.min(100, numero(taxaPct)),
        taxa_plataforma_teto: opcional(taxaTeto),
        taxa_plataforma_fixa: numero(taxaFixa),
      }),
    [
      quantidade,
      custo,
      frete,
      outros,
      impostos,
      comissao,
      margemMin,
      referencia,
      mercado,
      taxaPct,
      taxaTeto,
      taxaFixa,
    ],
  );
  const preenchido = numero(custo) > 0;

  return (
    <>
      {inicial ? (
        <Alert kind="info">
          Simulando o edital inteiro “{inicial.titulo}”: quantidade 1 e o valor estimado total como
          referência. Coloque no custo o total que você gastaria para entregar tudo. Para um item
          só, mude a quantidade e o preço unitário.
        </Alert>
      ) : null}
      <div className="an-sim">
        <section className="ui-panel ui-form an-sim-form" aria-label="Dados da proposta">
          <h2>Seus números</h2>
          <div className="an-sim-grid">
            <Campo rotulo="Quantidade" valor={quantidade} onChange={setQuantidade} />
            <Campo
              rotulo="Seu custo por unidade (R$)"
              valor={custo}
              onChange={setCusto}
              ajuda="Compra, produção ou serviço, sem imposto de venda."
            />
            <Campo rotulo="Frete total (R$)" valor={frete} onChange={setFrete} />
            <Campo
              rotulo="Outros custos totais (R$)"
              valor={outros}
              onChange={setOutros}
              ajuda="Embalagem, garantia, mão de obra."
            />
            <Campo
              rotulo="Impostos sobre a venda"
              valor={impostos}
              onChange={setImpostos}
              sufixo="%"
              ajuda="Confirme com seu contador (Simples, Presumido…)."
            />
            <Campo
              rotulo="Comissão / intermediação"
              valor={comissao}
              onChange={setComissao}
              sufixo="%"
            />
            <label>
              Plataforma de disputa
              <select
                value={plataforma}
                onChange={(event) => escolherPlataforma(event.target.value as ChavePlataforma)}
              >
                {(Object.keys(PLATAFORMAS) as ChavePlataforma[]).map((chave) => (
                  <option key={chave} value={chave}>
                    {PLATAFORMAS[chave].rotulo}
                  </option>
                ))}
              </select>
              <small>
                {PLATAFORMAS[plataforma].dica ||
                  'A taxa de quem hospeda o pregão entra na conta. Confira no edital qual é.'}
              </small>
            </label>
            {plataforma === 'outra' ? (
              <>
                <Campo
                  rotulo="Taxa sobre o vendido"
                  valor={taxaPct}
                  onChange={setTaxaPct}
                  sufixo="%"
                />
                <Campo
                  rotulo="Teto da taxa por processo (R$)"
                  valor={taxaTeto}
                  onChange={setTaxaTeto}
                  ajuda="Deixe vazio se não há teto."
                />
                <Campo
                  rotulo="Valor fixo por processo (R$)"
                  valor={taxaFixa}
                  onChange={setTaxaFixa}
                />
              </>
            ) : null}
            <Campo
              rotulo="Margem mínima que você aceita"
              valor={margemMin}
              onChange={setMargemMin}
              sufixo="%"
              ajuda="Lucro sobre o valor vendido."
            />
            <Campo
              rotulo="Preço de referência do edital (R$ por unidade)"
              valor={referencia}
              onChange={setReferencia}
              ajuda="O valor estimado pelo órgão, que é o teto."
            />
            <Campo
              rotulo="Preço de mercado (R$ por unidade)"
              valor={mercado}
              onChange={setMercado}
              ajuda="Opcional. Ex.: a mediana em Preços pagos."
            />
          </div>
        </section>

        <section className="an-sim-resultado" aria-live="polite">
          {!preenchido ? (
            <Alert kind="info">
              Informe o seu custo por unidade para ver o preço mínimo e os cenários.
            </Alert>
          ) : (
            <>
              <div className="ui-kpis an-kpis">
                <Kpi label="Custo total" value={moeda2(resultado.custo_total)} />
                <Kpi
                  label="Ponto de equilíbrio"
                  value={moeda2(resultado.preco_equilibrio)}
                  hint="preço por unidade sem lucro"
                />
                <Kpi
                  label="Preço mínimo com margem"
                  value={moeda2(resultado.preco_minimo)}
                  hint={`para ${margemMin || 0}% de margem`}
                  tone={resultado.preco_minimo === null ? 'warn' : 'ok'}
                />
                <Kpi
                  label="Desconto máximo no lance"
                  value={
                    resultado.desconto_maximo_pct === null
                      ? '—'
                      : `${resultado.desconto_maximo_pct.toLocaleString('pt-BR')}%`
                  }
                  hint="sobre o preço de referência"
                />
              </div>
              {resultado.leitura_mercado ? (
                <Alert kind={resultado.leitura_mercado.diferenca_pct <= 0 ? 'success' : 'info'}>
                  {resultado.leitura_mercado.texto}
                </Alert>
              ) : null}
              {resultado.avisos.map((aviso) => (
                <Alert key={aviso} kind="info">
                  {aviso}
                </Alert>
              ))}
              {resultado.cenarios.length ? (
                <div className="ui-table-wrap">
                  <table className="ui-table an-sim-tabela" aria-label="Cenários de desconto">
                    <thead>
                      <tr>
                        <th scope="col">Desconto</th>
                        <th scope="col">Preço unitário</th>
                        <th scope="col">Receita</th>
                        <th scope="col">Impostos, comissão e taxas</th>
                        <th scope="col">Lucro</th>
                        <th scope="col">Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.cenarios.map((cenario) => (
                        <tr
                          key={cenario.desconto_pct}
                          className={cenario.atinge_margem_minima ? '' : 'an-sim-ruim'}
                        >
                          <td>{cenario.desconto_pct}%</td>
                          <td>{moeda2(cenario.preco_unitario)}</td>
                          <td>{moeda2(cenario.receita)}</td>
                          <td>{moeda2(cenario.impostos_e_comissao)}</td>
                          <td>{moeda2(cenario.lucro)}</td>
                          <td>
                            {cenario.margem_pct.toLocaleString('pt-BR')}%
                            {cenario.atinge_margem_minima ? '' : ' · abaixo da mínima'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <p className="an-aviso">
                Simulação de apoio com os números que você informou. Confira tributos, garantias e
                regras do edital antes de dar o lance.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
