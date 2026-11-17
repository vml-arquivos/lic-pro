import { describe, expect, it } from 'vitest';
import { classificarDocumento, classificarObjeto, gerarDocumentacaoTecnica } from '../src/index.js';

const todas = (doc: ReturnType<typeof gerarDocumentacaoTecnica>) =>
  doc.grupos.flatMap((grupo) => grupo.exigencias);

describe('classificarObjeto', () => {
  it('reconhece os tipos principais', () => {
    expect(classificarObjeto('Reforma e ampliação da escola municipal')).toBe('obra-engenharia');
    expect(classificarObjeto('Aquisição de medicamentos para a farmácia básica')).toBe('saude');
    expect(classificarObjeto('Gêneros alimentícios para merenda escolar')).toBe('alimentos');
    expect(classificarObjeto('Licença de software de gestão')).toBe('tecnologia');
    expect(classificarObjeto('Serviços de limpeza e conservação predial')).toBe(
      'servico-continuado',
    );
    expect(classificarObjeto('Aquisição de mobiliário escolar')).toBe('bens');
    expect(classificarObjeto('Palestra de capacitação')).toBe('servico-comum');
  });

  it('usa as descrições dos itens quando o objeto é genérico', () => {
    expect(classificarObjeto('Registro de preços', [{ descricao: 'Notebook 15 polegadas' }])).toBe(
      'tecnologia',
    );
  });
});

describe('gerarDocumentacaoTecnica', () => {
  it('traz o padrão da lei e diz que não houve confirmação no texto', () => {
    const doc = gerarDocumentacaoTecnica({ titulo: 'Aquisição de material de escritório' });
    const ids = todas(doc).map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'ato-constitutivo',
        'cnpj-cadastros',
        'certidoes-fiscais',
        'declaracoes-padrao',
        'balanco-falencia',
        'proposta-precos',
      ]),
    );
    expect(doc.total_mencionadas).toBe(0);
    expect(doc.resumo).toContain('padrão da lei');
    expect(doc.aviso).toContain('Confirme');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marca como mencionado o que o texto do edital cita', () => {
    const doc = gerarDocumentacaoTecnica({
      titulo: 'Serviços de vigilância',
      texto:
        'Exige atestado de capacidade técnica, balanço patrimonial, visita técnica e garantia contratual (seguro-garantia).',
    });
    const itens = todas(doc);
    const porId = (id: string) => itens.find((item) => item.id === id)!;
    expect(porId('atestado-capacidade')).toMatchObject({ mencionado: true });
    expect(porId('balanco-falencia')).toMatchObject({ origem: 'edital', mencionado: true });
    expect(porId('visita-tecnica').base).toContain('art. 63');
    expect(porId('garantia-execucao').grupo).toBe('garantias');
    expect(doc.total_mencionadas).toBeGreaterThanOrEqual(4);
  });

  it('obra pede conselho, acervo técnico, visita e garantia', () => {
    const ids = todas(gerarDocumentacaoTecnica({ titulo: 'Pavimentação asfáltica de ruas' })).map(
      (item) => item.id,
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        'registro-conselho',
        'atestado-capacidade',
        'visita-tecnica',
        'garantia-execucao',
        'composicao-preco',
      ]),
    );
  });

  it('usa o portal e o benefício de ME/EPP dos dados do PNCP', () => {
    const doc = gerarDocumentacaoTecnica({
      titulo: 'Aquisição de café',
      valor_estimado: 45_000,
      portal: 'BNC - Bolsa Nacional de Compras',
      portal_site: 'https://bnc.org.br/',
      itens: [{ descricao: 'Café torrado', beneficio: 'Participação exclusiva para ME/EPP' }],
    });
    const itens = todas(doc);
    expect(itens.find((i) => i.id === 'credenciamento-portal')?.titulo).toContain('BNC');
    expect(itens.find((i) => i.id === 'exclusivo-me-epp')).toMatchObject({
      origem: 'dados',
      mencionado: false,
    });
    expect(itens.find((i) => i.id === 'declaracao-me-epp')).toBeDefined();
  });

  it('compra federal pede SICAF e sem itens avisa para buscar os itens', () => {
    const doc = gerarDocumentacaoTecnica({
      titulo: 'Aquisição de toner',
      esfera: 'Federal',
      valor_estimado: 500_000,
    });
    expect(todas(doc).some((item) => item.id === 'sicaf')).toBe(true);
    expect(doc.pontos_de_atencao.join(' ')).toContain('Itens ainda não buscados');
    expect(todas(doc).some((item) => item.id === 'exclusivo-me-epp')).toBe(false);
  });

  it('classifica os arquivos do PNCP e avisa quando falta o edital', () => {
    expect(
      classificarDocumento({ tipo: 'Termo de Referência', nome_arquivo: 'TR.pdf' }).papel,
    ).toBe('termo-referencia');
    expect(classificarDocumento({ nome_arquivo: 'Minuta do contrato' }).papel).toBe(
      'minuta-contrato',
    );
    expect(classificarDocumento({ nome_arquivo: 'x.pdf' }).papel).toBe('outro');
    const doc = gerarDocumentacaoTecnica({
      titulo: 'Aquisição de material',
      portal: 'BLL Compras',
      documentos: [{ tipo: 'Anexo', nome_arquivo: 'Modelo de declaração' }],
    });
    expect(doc.documentos[0]!.papel).toBe('anexo');
    expect(doc.pontos_de_atencao[0]).toContain('BLL Compras');
  });

  it('é determinística e avisa de registro de preços e disputa fechada', () => {
    const entrada = {
      titulo: 'Aquisição de material de limpeza',
      srp: true,
      modo_disputa: 'Fechado',
    };
    const a = gerarDocumentacaoTecnica(entrada);
    expect(gerarDocumentacaoTecnica(entrada)).toEqual(a);
    const pontos = a.pontos_de_atencao.join(' ');
    expect(pontos).toContain('Registro de preços');
    expect(pontos).toContain('disputa fechado');
  });
});
