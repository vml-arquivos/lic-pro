import { describe, expect, it } from 'vitest';
import { PASSOS_DE_CONFIGURACAO, passosSemRepeticao } from '../src/index.js';

const passos = [
  { codigo: 'empresa', texto: 'Cadastre os dados da sua empresa.', href: '/empresas' },
  { codigo: 'docs_vencidos', texto: '2 documento(s) vencidos.', href: '/documentos' },
  { codigo: 'prazos', texto: '1 prazo(s) nos próximos 3 dias.', href: '/agenda' },
  { codigo: 'docs_vazio', texto: 'Cadastre seus documentos.', href: '/documentos' },
  { codigo: 'busca', texto: 'Salve uma busca no Radar.', href: '/radar' },
  { codigo: 'pipeline', texto: 'Salve no pipeline.', href: '/radar' },
];

describe('início da empresa: sugestões sem repetir os primeiros passos', () => {
  it('com a lista de primeiros passos na tela, esconde só o que ela já cobre', () => {
    const resto = passosSemRepeticao(passos, true).map((passo) => passo.codigo);
    expect(resto).toEqual(['docs_vencidos', 'prazos']);
  });

  it('sem a lista na tela, mostra todas as sugestões', () => {
    expect(passosSemRepeticao(passos, false)).toEqual(passos);
  });

  it('nunca esconde aviso do dia a dia', () => {
    for (const codigo of [
      'docs_vencidos',
      'prazos',
      'tarefas',
      'docs_vencendo',
      'checklist',
      'salvas',
    ]) {
      const passo = { codigo, texto: 'x', href: '/agenda' };
      expect(passosSemRepeticao([passo], true)).toEqual([passo]);
    }
  });

  it('os códigos de configuração são exatamente os que o servidor gera para começar', () => {
    expect([...PASSOS_DE_CONFIGURACAO].sort()).toEqual([
      'busca',
      'docs_vazio',
      'empresa',
      'pipeline',
    ]);
  });
});
