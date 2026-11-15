-- 0034 — Endereço e dados cadastrais da empresa
--
-- O cadastro da empresa passa a guardar o endereço completo (preenchido pelo CEP) e os dados da
-- Receita (preenchidos pelo CNPJ). Só acrescenta colunas opcionais: empresas existentes
-- continuam como estão, sem endereço até alguém preencher.
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS logradouro TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS complemento TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS email_contato TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cnae_principal TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cnae_descricao TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS situacao_cadastral TEXT;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS data_abertura DATE;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS natureza_juridica TEXT;
ALTER TABLE empresas DROP CONSTRAINT IF EXISTS empresas_cep_formato;
ALTER TABLE empresas ADD CONSTRAINT empresas_cep_formato CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$');
