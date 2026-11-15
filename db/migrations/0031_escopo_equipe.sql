-- Escopo da equipe administrativa.
--
-- Quem entra pelo papel `plataforma` pode ter acesso a tudo (padrão, como sempre foi), só ao
-- Painel admin (módulo Profissional) ou só ao Painel da mentoria (módulo Curso). O convite de
-- equipe carrega o escopo e a conta criada herda esse valor. Contas e convites existentes
-- continuam com acesso a tudo.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS escopo_equipe TEXT NOT NULL DEFAULT 'tudo'
  CHECK (escopo_equipe IN ('tudo', 'curso', 'profissional'));

ALTER TABLE convites
  ADD COLUMN IF NOT EXISTS escopo TEXT NOT NULL DEFAULT 'tudo'
  CHECK (escopo IN ('tudo', 'curso', 'profissional'));
