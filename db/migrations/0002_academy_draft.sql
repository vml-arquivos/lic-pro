-- Conteúdo editorial inicial. Tudo permanece rascunho_para_revisao até validação humana.

DO $$
DECLARE
  v_trilha UUID;
  v_modulo UUID;
BEGIN
  INSERT INTO trilhas (slug, titulo, descricao, status)
  VALUES (
    'do-zero-ao-primeiro-pregao',
    'Do zero ao primeiro pregão',
    'Estrutura inicial de aprendizagem para conhecer o processo com segurança e apoio.',
    'rascunho_para_revisao'
  )
  ON CONFLICT (slug) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    descricao = EXCLUDED.descricao,
    status = 'rascunho_para_revisao',
    updated_at = now();

  SELECT id INTO v_trilha FROM trilhas WHERE slug = 'do-zero-ao-primeiro-pregao';

  INSERT INTO modulos (trilha_id, ordem, titulo, resumo, status)
  VALUES
    (v_trilha, 1, 'Começando pelo contexto', 'O que é uma contratação pública e quais são os principais participantes.', 'rascunho_para_revisao'),
    (v_trilha, 2, 'Encontrando oportunidades', 'Como organizar uma busca e reconhecer informações importantes em um edital.', 'rascunho_para_revisao'),
    (v_trilha, 3, 'Lendo um edital', 'Como percorrer seções, anexos, itens e fontes sem tirar conclusões precipitadas.', 'rascunho_para_revisao'),
    (v_trilha, 4, 'Preparando a participação', 'Checklist de documentos, dúvidas e pontos para revisão antes de decidir participar.', 'rascunho_para_revisao'),
    (v_trilha, 5, 'Aprendendo com segurança', 'Como registrar aprendizados, pedir ajuda e usar o simulador sem operar portais reais.', 'rascunho_para_revisao')
  ON CONFLICT (trilha_id, ordem) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    resumo = EXCLUDED.resumo,
    status = 'rascunho_para_revisao';

  FOR v_modulo IN SELECT id FROM modulos WHERE trilha_id = v_trilha LOOP
    INSERT INTO aulas (modulo_id, ordem, titulo, tipo, conteudo, status)
    VALUES (
      v_modulo,
      1,
      'Aula de abertura — conteúdo em revisão',
      'texto',
      'Este material é um roteiro inicial. O conteúdo será revisado antes de ser publicado.',
      'rascunho_para_revisao'
    )
    ON CONFLICT (modulo_id, ordem) DO UPDATE SET
      titulo = EXCLUDED.titulo,
      conteudo = EXCLUDED.conteudo,
      status = 'rascunho_para_revisao';
  END LOOP;
END $$;

INSERT INTO glossario_termos (termo, definicao_simples, definicao_tecnica, referencia, status)
VALUES
  ('Edital', 'Documento que apresenta as regras e informações de uma oportunidade de contratação.', 'Instrumento convocatório que reúne condições, critérios e anexos do procedimento.', 'Verificar na norma e no edital vigente.', 'rascunho_para_revisao'),
  ('Habilitação', 'Etapa em que se conferem documentos e condições exigidos para participar.', 'Conjunto de requisitos e documentos previstos no instrumento convocatório.', 'Verificar no edital e na norma vigente.', 'rascunho_para_revisao'),
  ('CATMAT/CATSER', 'Códigos usados para organizar materiais e serviços em catálogos públicos.', 'Referências de catalogação utilizadas para classificar objetos de contratação.', 'Verificar a fonte oficial vigente.', 'rascunho_para_revisao')
ON CONFLICT (termo) DO UPDATE SET
  definicao_simples = EXCLUDED.definicao_simples,
  definicao_tecnica = EXCLUDED.definicao_tecnica,
  referencia = EXCLUDED.referencia,
  status = 'rascunho_para_revisao';
