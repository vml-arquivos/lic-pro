import { describe, expect, it } from 'vitest';
import {
  agruparConcorrentes,
  compararPreco,
  documentoDoFornecedor,
  formatarDocumento,
  palavrasDoAssunto,
  similaridadeDeAssunto,
  type RegistroDeCompra,
} from '../src/index';

const base: RegistroDeCompra = {
  fornecedor: 'ACME LTDA',
  cnpj: '11.222.333/0001-81',
  valor: 1000,
  data: '2026-05-10T00:00:00.000Z',
  orgao: 'Prefeitura A',
  uf: 'rr',
  objeto: 'Papel A4',
  origem: 'pncp-contrato',
  link: 'https://pncp.gov.br/app/contratos/1',
};

describe('documento do fornecedor', () => {
  it('aceita CNPJ e CPF, descarta lixo e mascara CPF', () => {
    expect(documentoDoFornecedor('11.222.333/0001-81')).toBe('11222333000181');
    expect(documentoDoFornecedor('123.456.789-09')).toBe('12345678909');
    expect(documentoDoFornecedor('abc')).toBeNull();
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarDocumento('12345678909')).toBe('***.456.789-**');
    expect(formatarDocumento(null)).toBeNull();
  });
});

describe('assunto parecido', () => {
  it('ignora acento, plural e palavras vazias', () => {
    const palavras = palavrasDoAssunto(
      'Aquisição de Canetas esferográficas azuis para a Prefeitura',
    );
    expect(palavras.has('caneta')).toBe(true);
    expect(palavras.has('prefeitura')).toBe(false);
    expect(palavras.has('aquisicao')).toBe(false);
  });
  it('exige palavras em comum de verdade', () => {
    expect(
      similaridadeDeAssunto('papel sulfite A4 resma branca', 'resmas de papel sulfite 75g'),
    ).toBeGreaterThanOrEqual(0.5);
    expect(similaridadeDeAssunto('papel sulfite resma branca', 'pneus aro 17 caminhonete')).toBe(0);
    // uma palavra só em comum entre textos longos não basta
    expect(similaridadeDeAssunto('papel sulfite resma branca', 'papel higienico folha dupla')).toBe(
      0,
    );
    expect(similaridadeDeAssunto('', 'qualquer coisa')).toBe(0);
  });
});

describe('concorrentes pelo histórico', () => {
  it('junta por CNPJ, soma contratos, ordena por vitórias e não conta o mesmo contrato duas vezes', () => {
    const lista = agruparConcorrentes([
      base,
      {
        ...base,
        link: 'https://pncp.gov.br/app/contratos/2',
        valor: 500,
        data: '2026-08-01T00:00:00.000Z',
        uf: 'AM',
      },
      { ...base, link: 'https://pncp.gov.br/app/contratos/2', valor: 500 }, // repetido
      {
        ...base,
        fornecedor: 'Outra SA',
        cnpj: '99888777000166',
        link: 'https://x/3',
        valor: 99999,
      },
      {
        ...base,
        fornecedor: 'Sem Documento',
        cnpj: null,
        link: null,
        origem: 'compras-gov-preco',
        valor: 7,
      },
      { ...base, fornecedor: null, cnpj: null }, // sem identificação: fora
    ]);
    expect(lista.map((c) => c.nome)).toEqual(['ACME LTDA', 'Outra SA', 'Sem Documento']);
    const acme = lista[0]!;
    expect(acme.vitorias).toBe(2);
    expect(acme.valor_contratos).toBe(1500);
    expect(acme.ultima_data).toBe('2026-08-01T00:00:00.000Z');
    expect(acme.ufs).toEqual(['AM', 'RR']);
    expect(acme.exemplos[0]!.data).toBe('2026-08-01T00:00:00.000Z');
    // preço unitário (Compras.gov.br) não entra na soma de contratos
    expect(lista[2]!.valor_contratos).toBeNull();
    expect(lista[2]!.cnpj).toBeNull();
  });

  it('respeita o limite', () => {
    const muitos = Array.from({ length: 30 }, (_, i) => ({
      ...base,
      cnpj: String(10000000000000 + i),
      link: `https://x/${i}`,
    }));
    expect(agruparConcorrentes(muitos, 5)).toHaveLength(5);
  });
});

describe('privacidade', () => {
  it('CPF de pessoa física não sai na lista de concorrentes', () => {
    const [pessoa] = agruparConcorrentes([
      { ...base, fornecedor: 'João da Silva', cnpj: '123.456.789-09', link: 'https://x/pf' },
    ]);
    expect(pessoa!.cnpj).toBeNull();
    expect(pessoa!.pessoa_fisica).toBe(true);
    expect(JSON.stringify(pessoa)).not.toContain('12345678909');
  });
});

describe('comparação de preço', () => {
  const stats = { amostras: 20, minimo: 10, maximo: 40, mediana: 20, p25: 15, p75: 25 };
  it('classifica pela faixa real das compras', () => {
    expect(compararPreco(20, stats).posicao).toBe('na_faixa');
    expect(compararPreco(12, stats).posicao).toBe('abaixo_da_faixa');
    expect(compararPreco(30, stats).posicao).toBe('acima_da_faixa');
    expect(compararPreco(5, stats).posicao).toBe('abaixo_do_minimo');
    expect(compararPreco(50, stats).posicao).toBe('acima_do_maximo');
    expect(compararPreco(30, stats).diferenca_mediana_pct).toBe(50);
    expect(compararPreco(30, stats).texto).toContain('50% acima da mediana');
  });
  it('não conclui nada sem dados suficientes', () => {
    expect(compararPreco(null, stats).posicao).toBeNull();
    expect(compararPreco(10, null).texto).toContain('Sem compras anteriores');
    const poucas = compararPreco(10, { ...stats, amostras: 2 });
    expect(poucas.posicao).toBeNull();
    expect(poucas.texto).toContain('Poucas compras');
  });
});
