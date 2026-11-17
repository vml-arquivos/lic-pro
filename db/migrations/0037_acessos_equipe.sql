-- Acessos da equipe: funções bloqueadas por pessoa.
--
-- O superadmin marca, para cada acesso da equipe (papel `plataforma`), as funções que ficam
-- bloqueadas. A lista guarda os caminhos das páginas do menu (ex.: '/radar', '/admin/financeiro').
-- Vazia = sem bloqueio, como sempre foi. O convite de equipe também carrega a lista, e a conta
-- criada herda. Só acrescenta colunas; nada existente muda.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS acessos_bloqueados TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE convites
  ADD COLUMN IF NOT EXISTS acessos_bloqueados TEXT[] NOT NULL DEFAULT '{}';
