-- Fase A (v2) — separação de áreas: papel da equipe do produto.
--
-- Até aqui o papel `admin` servia a dois públicos: o dono do produto e a empresa cliente
-- (cada cadastro nascia como `admin` do próprio tenant). Esta migration cria o papel
-- `plataforma`, exclusivo da equipe do Licite Comigo.
--
-- O PostgreSQL só permite usar um valor novo de enum depois que a transação que o criou
-- termina. Por isso esta migration só cria o valor; a 0016 passa a usá-lo.

ALTER TYPE papel_usuario ADD VALUE IF NOT EXISTS 'plataforma';
