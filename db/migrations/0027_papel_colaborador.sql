-- Colaboradores: equipe de operação do Licite Comigo (busca e acompanha licitações pela
-- própria empresa), com acesso próprio e nichos definidos pela Administração.
--
-- O PostgreSQL só permite usar um valor novo de enum depois que a transação que o criou
-- termina. Por isso esta migration só cria o valor; a 0028 passa a usá-lo.

ALTER TYPE papel_usuario ADD VALUE IF NOT EXISTS 'colaborador';
