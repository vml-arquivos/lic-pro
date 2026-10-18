-- Correção pós-Etapa 0: licite_owner precisa de USAGE no schema public.
--
-- O PostgreSQL executa as checagens de chave estrangeira (RI triggers) com os
-- privilégios do DONO da tabela referenciadora. Antes da Etapa 0, licite_owner era
-- o dono do banco e, por isso, do schema public (pg_database_owner). Com
-- licite_admin como usuário inicial do cluster, licite_owner deixou de ter acesso e
-- qualquer INSERT/UPDATE com chave estrangeira falhava com
-- "permission denied for schema public" (cadastro, bootstrap do admin, ingestão).
--
-- Não alterar migrations anteriores: esta é a correção para instalações existentes e novas.

GRANT USAGE ON SCHEMA public TO licite_owner;
