import { describe, expect, it } from 'vitest';
import { alertasDosFatos, extrairFatos, type PaginaLida } from '../src/leitura-edital.js';

const edital: PaginaLida[] = [
  {
    documento: 'Edital',
    pagina: 1,
    texto: `O critério de julgamento será o de menor preço por item. A validade da proposta será de 60 (sessenta) dias.
      A participação é exclusiva para microempresas e empresas de pequeno porte. Não será permitida a participação de consórcio.
      Os pedidos de esclarecimentos e impugnações deverão ser enviados até 3 (três) dias úteis antes da data de abertura.`,
  },
  {
    documento: 'Edital',
    pagina: 4,
    texto: `Será exigida visita técnica obrigatória ao local. O licitante vencedor deverá apresentar amostra no prazo de 5 (cinco) dias úteis.
      Será exigida garantia contratual de 5% do valor do contrato. O pagamento será efetuado em até 30 (trinta) dias após o recebimento da nota fiscal.`,
  },
  {
    documento: 'Termo de Referência',
    pagina: 2,
    texto: `O prazo de entrega é de 10 (dez) dias corridos, contados do recebimento da nota de empenho. A vigência do contrato será de 12 (doze) meses.
      Multa de 0,5% ao dia, limitada a 20% do valor do contrato. Garantia dos equipamentos de no mínimo 12 (doze) meses.
      Exige-se atestado de capacidade técnica com quantidade mínima de 50% do objeto. Índices de liquidez geral e liquidez corrente maiores que 1.`,
  },
];

describe('leitura do edital', () => {
  const fatos = extrairFatos(edital);
  const valor = (id: string) => fatos.find((fato) => fato.id === id)?.valor;

  it('acha os dados práticos com página e trecho', () => {
    expect(valor('validade-proposta')).toBe('60 dias');
    expect(valor('criterio')).toBe('Menor preço por item');
    expect(valor('exclusivo-mpe')).toBe('Sim');
    expect(valor('consorcio')).toBe('Não aceita');
    expect(valor('impugnacao')).toBe('Até 3 dias úteis antes da abertura');
    expect(valor('visita-tecnica')).toBe('Obrigatória');
    expect(valor('amostra')).toBe('Exigida, em até 5 dias úteis');
    expect(valor('garantia-contratual')).toBe('5% do valor do contrato');
    expect(valor('pagamento')).toBe('Até 30 dias');
    expect(valor('prazo-entrega')).toBe('10 dias corridos após o pedido');
    expect(valor('vigencia')).toBe('12 meses');
    expect(valor('multa')).toBe('De 0,5% a 20%');
    expect(valor('garantia-produto')).toBe('Mínimo de 12 meses');
    expect(valor('atestado')).toBe('Exigido, com mínimo de 50% do objeto');
    expect(valor('balanco')).toBe('Exige índices (LG, LC)');
    const multa = fatos.find((fato) => fato.id === 'multa')!;
    expect(multa.documento).toBe('Termo de Referência');
    expect(multa.pagina).toBe(2);
    expect(multa.trecho).toContain('20%');
  });

  it('não inventa o que o texto não diz', () => {
    const vazio = extrairFatos([
      { documento: 'Edital', pagina: 1, texto: 'Objeto: aquisição de materiais de escritório.' },
    ]);
    expect(vazio).toEqual([]);
    expect(extrairFatos([])).toEqual([]);
  });

  it('respeita quando o edital dispensa', () => {
    const lido = extrairFatos([
      {
        documento: 'Edital',
        pagina: 2,
        texto:
          'Não será exigida amostra. A visita técnica é facultativa. Não será exigida garantia contratual.',
      },
    ]);
    const por = (id: string) => lido.find((fato) => fato.id === id)?.valor;
    expect(por('amostra')).toBe('Não exigida');
    expect(por('visita-tecnica')).toBe('Facultativa');
    expect(por('garantia-contratual')).toBe('Não exigida');
    expect(alertasDosFatos(lido)).toEqual([]);
  });

  it('gera avisos curtos', () => {
    const textos = alertasDosFatos(fatos).map((alerta) => alerta.texto);
    expect(textos).toContain('Pede amostra. Conte com tempo e custo.');
    expect(textos).toContain('Visita técnica obrigatória. Marque antes da sessão.');
    expect(textos).toContain('Garantia do contrato: 5% do valor do contrato.');
    expect(textos).toContain('Multa pode chegar a 20%.');
    expect(textos).toContain('Só ME/EPP pode disputar.');
    expect(textos).toContain('Não aceita consórcio.');
  });
});
