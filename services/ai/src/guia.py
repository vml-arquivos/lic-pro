"""Guia de uso do Licite Comigo: respostas curtas e verificadas sobre onde fica cada coisa.

São textos fixos (não dependem de modelo de linguagem), por isso funcionam mesmo sem provedor de IA
configurado e nunca inventam uma tela que não existe.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass

EMPRESA = ("empresa", "colaborador", "administracao", "curso")
ALUNO = ("aluno",)
MENTOR = ("mentor",)
TODAS = ("empresa", "colaborador", "administracao", "curso", "aluno", "mentor")


@dataclass(frozen=True)
class GuideEntry:
    titulo: str
    palavras: tuple[str, ...]
    resposta: str
    href: str
    areas: tuple[str, ...]


GUIDE: tuple[GuideEntry, ...] = (
    GuideEntry(
        "Achar licitações do meu segmento",
        ("segmento", "nicho", "buscar", "procurar", "filtro", "explorar", "radar", "produto", "servico"),
        "Em Explorar licitações, escolha o segmento e o produto ou serviço nas listas (cada opção mostra quantas "
        "licitações abertas existem). Se o que você vende não estiver na lista, digite em Palavras-chave. "
        "Salve em Meu perfil para a busca já abrir só com o que combina com você.",
        "/radar",
        EMPRESA + ALUNO,
    ),
    GuideEntry(
        "Criar um alerta",
        ("alerta", "avisar", "aviso", "notificacao", "notificar", "tempo real"),
        "Faça uma busca em Explorar licitações, clique para salvar a busca e ative o alerta. A partir daí o "
        "sistema avisa quando surgir ou mudar uma licitação que combine com ela. Você gerencia tudo em Alertas.",
        "/alertas",
        EMPRESA,
    ),
    GuideEntry(
        "Meu perfil e melhores oportunidades",
        ("perfil", "melhores", "compativel", "compatibilidade", "ordenar", "relevante"),
        "Preencha Meu perfil (nicho, segmento, produtos/serviços, estados e faixa de valor). Depois, ordene por "
        "Maior compatibilidade: a nota é explicável e mostra o que combinou com você.",
        "/radar",
        EMPRESA,
    ),
    GuideEntry(
        "Simular uma proposta",
        ("simular", "simulacao", "proposta", "preco", "margem", "lucro", "custo"),
        "Abra o edital e use Simular proposta, ou vá em Análise. Informe o seu custo e a margem desejada: o "
        "sistema compara com preços já pagos pelo governo. É uma estimativa de apoio, não uma garantia.",
        "/analise",
        EMPRESA + ALUNO,
    ),
    GuideEntry(
        "Preços pagos pelo governo",
        ("preco pago", "precos pagos", "quanto o governo pagou", "historico de preco", "mediana"),
        "Em Preços pagos você pesquisa o que o governo pagou por um item, com mediana e faixa. Use para "
        "calibrar a sua proposta.",
        "/precos",
        EMPRESA + ALUNO,
    ),
    GuideEntry(
        "Documentos de habilitação",
        ("documento", "habilitacao", "certidao", "validade", "vencer"),
        "Guarde os documentos da empresa em Documentos com a data de validade: o sistema avisa o que vence. "
        "Cada edital lista os documentos exigidos; confira sempre no edital oficial.",
        "/documentos",
        EMPRESA,
    ),
    GuideEntry(
        "Pipeline de oportunidades",
        ("pipeline", "oportunidade", "kanban", "acompanhar", "etapa", "funil"),
        "Salve a licitação como oportunidade e mova entre as etapas em Oportunidades. Lá você anota, cria "
        "checklist e agenda prazos.",
        "/oportunidades",
        EMPRESA,
    ),
    GuideEntry(
        "Agenda e prazos",
        ("agenda", "prazo", "calendario", "lembrete", "lembrar"),
        "Os prazos das oportunidades aparecem na Agenda e no seu Início. Cadastre a data da sessão ou da "
        "entrega para eu poder lembrar você.",
        "/agenda",
        EMPRESA,
    ),
    GuideEntry(
        "Pregões publicados",
        ("pregao", "pregoes", "sessao", "disputa", "ao vivo"),
        "Em Pregões publicados você vê as licitações com data de sessão e a situação. O PNCP não divulga "
        "lances em tempo real; o sistema avisa mudanças de situação, prazo e sessão.",
        "/pregoes",
        EMPRESA + ALUNO,
    ),
    GuideEntry(
        "Planos, uso e cobrança",
        ("plano", "assinatura", "cobranca", "fatura", "pagamento", "cancelar", "limite"),
        "Em Assinatura e uso você vê o plano, o consumo e as cobranças.",
        "/assinatura",
        ("empresa",),
    ),
    GuideEntry(
        "Estudar: aulas e plano de 30 dias",
        ("aula", "estudar", "curso", "plano de 30", "trilha", "modulo", "progresso"),
        "Suas aulas ficam na Academia, e o Plano de 30 dias organiza o que fazer a cada dia. Comece pelo "
        "diagnóstico se ainda não fez.",
        "/academia",
        ALUNO + MENTOR,
    ),
    GuideEntry(
        "Praticar com editais reais",
        ("praticar", "pratica", "treinar", "exercicio", "devolutiva"),
        "Em Praticar com editais você escolhe uma licitação real, responde às perguntas guiadas e envia para "
        "a mentoria devolver com comentários.",
        "/praticar",
        ALUNO,
    ),
    GuideEntry(
        "Mentoria e encontros",
        ("mentoria", "sessao de mentoria", "encontro", "mentor", "agendar"),
        "Veja suas sessões em Mentoria e os encontros ao vivo em Encontros ao vivo.",
        "/mentoria",
        ALUNO,
    ),
    GuideEntry(
        "Certificado",
        ("certificado", "concluir", "conclusao"),
        "O certificado fica disponível em Certificado quando você conclui as aulas exigidas.",
        "/certificado",
        ALUNO,
    ),
    GuideEntry(
        "Acompanhar meus alunos",
        ("aluno", "alunos", "turma", "progresso", "parado", "engajamento"),
        "Em Meus alunos você vê o progresso, o que está parado e o que precisa de revisão. Devolutivas lista "
        "as práticas aguardando retorno.",
        "/mentor",
        MENTOR,
    ),
    GuideEntry(
        "Devolutivas e sessões",
        ("devolutiva", "feedback", "pratica", "sessao", "reuniao"),
        "Use Devolutivas para responder às práticas e Sessões para marcar e registrar as conversas.",
        "/mentor/devolutivas",
        MENTOR,
    ),
    GuideEntry(
        "Operação e fontes de dados",
        ("fonte", "coleta", "captura", "pncp", "atualizacao", "sincronizacao", "dados"),
        "Em Fontes de dados você vê a última coleta do PNCP, o intervalo, as falhas e pode iniciar uma "
        "coleta manual. O Farol mostra “dados atualizados há X min”.",
        "/admin/fontes",
        ("administracao",),
    ),
    GuideEntry(
        "Clientes, leads e financeiro",
        ("cliente", "lead", "financeiro", "assinante", "receita", "cupom", "plano"),
        "Empresas clientes, Leads, Financeiro, Assinantes, Planos e Cupons ficam no grupo Vendas e financeiro "
        "do menu do Painel admin.",
        "/admin",
        ("administracao",),
    ),
    GuideEntry(
        "Alunos, turmas e vendas do curso",
        ("aluno", "turma", "mentor", "curso", "convite", "lead"),
        "Alunos e turmas, Mentores, Materiais, Leads e Vendas do curso ficam no menu do Painel da mentoria.",
        "/gestao",
        ("curso",),
    ),
    GuideEntry(
        "Minha conta",
        ("conta", "senha", "meus dados", "email", "trocar"),
        "Seus dados, senha e preferências ficam em Minha conta.",
        "/conta",
        TODAS,
    ),
)


def _plain(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text.lower())
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def find_guide(message: str, area: str) -> GuideEntry | None:
    """A entrada do guia que melhor combina com a pergunta, ou None se nenhuma combinar."""
    text = _plain(message)
    best: tuple[int, GuideEntry] | None = None
    for entry in GUIDE:
        if area not in entry.areas:
            continue
        score = sum(len(word) for word in entry.palavras if _plain(word) in text)
        if score and (best is None or score > best[0]):
            best = (score, entry)
    return best[1] if best else None


def topics_for(area: str) -> str:
    return "; ".join(entry.titulo for entry in GUIDE if area in entry.areas)
