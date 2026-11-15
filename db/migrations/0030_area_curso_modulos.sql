-- Módulos Curso e Profissional.
--
-- A equipe passa a "ver como" também a Administração do curso (área `curso`), separada da
-- Administração do módulo Profissional. Só amplia o valor aceito em `visualizar_como`;
-- nenhum dado existente muda, e o dinheiro/leads continuam nas mesmas tabelas (a separação por
-- módulo é feita nas consultas, por `cobrancas.tipo`, `planos.tipo` e `leads.perfil`).
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_visualizar_como_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_visualizar_como_check
  CHECK (visualizar_como IS NULL
         OR visualizar_como IN ('administracao', 'curso', 'empresa', 'aluno', 'mentor', 'colaborador'));

-- A Administração avisa quando o banco está desatualizado (migrations por aplicar). Para isso a
-- API só precisa LER o registro de migrations já aplicadas.
GRANT SELECT ON schema_migrations TO licite_core;
