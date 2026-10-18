# Provider Gemini para a Ana — 2026-10

A integração escolhida para o chatbot usa a compatibilidade oficial do Gemini com o protocolo OpenAI, mas aponta para a infraestrutura da Google e usa uma chave Gemini. O serviço não chama a API da OpenAI. Em produção, o Core deve usar `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-2.5-pro`, `EMBEDDING_PROVIDER=gemini`, `EMBEDDING_MODEL=gemini-embedding-001` e `GEMINI_API_KEY` em segredo do Coolify.

O endpoint de geração compatível é `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`. A documentação oficial da Google mostra que o cliente pode usar a chave Gemini como Bearer e escolher o modelo `gemini-2.5-pro`. Para embeddings, a mesma compatibilidade expõe `https://generativelanguage.googleapis.com/v1beta/openai/embeddings` com `gemini-embedding-001`; o adapter mantém o contrato de 1024 dimensões exigido pelo `pgvector` da plataforma.

A Ana continua protegida pelo proxy web e pelo JWT do usuário. O prompt permanece somente-leitura, com histórico tenant/user, sem afirmar prazos, valores, elegibilidade ou conclusões jurídicas sem evidência oficial. Providers `fake` e `deterministic` continuam proibidos em produção.

## Fontes oficiais

- [1] [Gemini API reference](https://ai.google.dev/api) — endpoints `generateContent`, `streamGenerateContent`, `embedContent` e autenticação por `x-goog-api-key`.
- [2] [OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai) — `chat.completions` e `embeddings` com base URL `https://generativelanguage.googleapis.com/v1beta/openai/`.
- [3] [Models](https://ai.google.dev/gemini-api/docs/models) — modelo estável `gemini-2.5-pro` e modelos de embedding disponíveis.
- [4] [Embeddings](https://ai.google.dev/gemini-api/docs/embeddings) — `gemini-embedding-001`, redução de dimensionalidade e usos de recuperação.
- [5] [API keys](https://ai.google.dev/gemini-api/docs/api-key) — gestão, restrições e regra de não expor a chave no cliente ou no repositório.
