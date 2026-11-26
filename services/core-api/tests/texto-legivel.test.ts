import { describe, expect, it } from 'vitest';
import {
  MARCA_PAGINA,
  MARCA_TRECHO,
  limparPagina,
  linhaIlegivel,
  semMarcas,
} from '../src/texto-legivel.js';

const Q = '�';
/** Linhas reais de uma página de jornal (Publicidade Legal) lida sem tradução de fonte. */
const LIXO = [
  `${Q}${Q}${Q}!#${Q}"${Q} ${Q}${Q} ${Q}${Q} ${Q}${Q}${Q}${Q}`,
  `!#${Q}${Q} $${Q}!${Q} ${Q}${Q} $${Q}${Q}${Q}${Q}!`,
  `%${Q}${Q} ${Q}${Q} ${Q}${Q}"${Q}${Q}${Q}`,
  `"=${Q}${Q}${Q}${Q}${Q} ${Q}${Q} !${Q}${Q}# ${Q}${Q}<${Q} ${Q}${Q} " ${Q}${Q}${Q}${Q}${Q}${Q}`,
  `${Q}&5& (21(255*5 ?6 2325781.)&)*6 *035*6&6 3&5(*.58&6 (&)&675* 6*8 (855C(8/2`,
  `$&.&6 325 H5*&${Q}`,
  // Sem nenhum caractere de substituição: só símbolos e números no lugar das letras.
  '&5& (21(255*5 ?6 2325781.)&)*6',
  '*035*6&6 3&5(*.58&6 (&)&675* 6*8',
];

describe('texto ilegível de PDF', () => {
  it('reconhece as linhas de lixo da página de jornal', () => {
    for (const linha of LIXO) expect(linhaIlegivel(linha), linha).toBe(true);
  });

  it('não confunde texto de edital com lixo', () => {
    const boas = [
      'PUBLICIDADE LEGAL',
      'https://ohoje.com/publicidade-legal/portal-da-mata-empreendimentos',
      'Art. 5º - O prazo para impugnação é de 3 (três) dias úteis.',
      'CNPJ 00.394.460/0001-41',
      'R$ 1.234,56 R$ 7.890,12',
      '1 Papel A4 75g RESMA 100 18,50',
      '________________________________',
      '======== ANEXO I ========',
      'contato@empresa.com.br (95) 3224-0000',
      'A & B Comércio Ltda',
      '1.234,56',
      '| item | valor | total |',
      '[ ] declaro que cumpro os requisitos',
      'Pregão Eletrônico nº 12/2026 - Menor preço por item',
    ];
    for (const linha of boas) expect(linhaIlegivel(linha), linha).toBe(false);
  });

  it('página quase toda ilegível vira uma linha de aviso', () => {
    const pagina = ['PUBLICIDADE LEGAL', ...LIXO].join('\n');
    const limpa = limparPagina(pagina);
    expect(limpa).toMatchObject({ texto: MARCA_PAGINA, ilegivel: true });
  });

  it('trecho ilegível no meio de uma página legível some e fica um aviso só', () => {
    const pagina = [
      'O prazo de entrega é de 10 dias.',
      'A proposta deve ser enviada pelo portal.',
      LIXO[0],
      LIXO[1],
      LIXO[2],
      'Fica eleito o foro da comarca de Boa Vista.',
      'Os pagamentos serão feitos em até 30 dias.',
      'A garantia contratual será de 5% do valor.',
    ].join('\n');
    const limpa = limparPagina(pagina);
    expect(limpa.ilegivel).toBe(false);
    expect(limpa.removidas).toBe(3);
    expect(limpa.texto.split('\n').filter((linha) => linha === MARCA_TRECHO)).toHaveLength(1);
    expect(limpa.texto).toContain('O prazo de entrega é de 10 dias.');
    expect(limpa.texto).toContain('A garantia contratual será de 5% do valor.');
    expect(limpa.texto).not.toContain(Q);
    expect(semMarcas(limpa.texto)).not.toContain('Trecho');
  });

  it('página normal passa sem mudança', () => {
    const pagina = 'Linha um.\n\nLinha dois com R$ 10,00.\n';
    expect(limparPagina(pagina)).toEqual({ texto: pagina, ilegivel: false, removidas: 0 });
  });
});
