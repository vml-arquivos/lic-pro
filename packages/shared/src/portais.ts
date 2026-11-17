/**
 * Portais de compras: de onde cada licitação vem de fato.
 *
 * O PNCP guarda o editais de todo o país, mas quem publica e recebe as propostas é o portal (o
 * sistema de origem). A API de consulta do PNCP informa isso em dois campos da contratação:
 * `usuarioNome` ("Nome do Usuário/Sistema que enviou a Contratação") e `linkSistemaOrigem` (a
 * página do portal para enviar propostas). Aqui os nomes e links são reduzidos a um nome único
 * por portal, para o filtro e a lista de Portais não se dividirem em "BLL", "Bll Compras",
 * "BLL - Bolsa de Licitações"...
 *
 * Cálculo puro (sem rede e sem banco): roda igual na coleta, na API e na tela. Portal fora da
 * lista conhecida continua aparecendo, com o nome que o PNCP informou.
 */

export type PortalConhecido = {
  slug: string;
  nome: string;
  /** Página inicial do portal (para o usuário abrir e pesquisar nele). */
  site: string;
  /** Uma linha sobre quem opera o portal. */
  descricao: string;
  /** Trechos (sem acento, minúsculos) que identificam o portal no nome informado pelo PNCP. */
  nomes: readonly string[];
  /** Domínios (sem "www.") que identificam o portal no link de origem. */
  hosts: readonly string[];
};

export const PORTAIS_CONHECIDOS: readonly PortalConhecido[] = [
  {
    slug: 'compras-gov-br',
    nome: 'Compras.gov.br',
    site: 'https://www.gov.br/compras/pt-br',
    descricao: 'Sistema de compras do Governo Federal (antigo ComprasNet).',
    nomes: ['compras.gov', 'comprasgov', 'comprasnet', 'compras net', 'siasg'],
    hosts: ['compras.gov.br', 'comprasnet.gov.br', 'comprasgovernamentais.gov.br'],
  },
  {
    slug: 'portal-de-compras-publicas',
    nome: 'Portal de Compras Públicas',
    site: 'https://www.portaldecompraspublicas.com.br/',
    descricao: 'Portal privado usado por muitas prefeituras e câmaras.',
    nomes: ['portal de compras publicas', 'portaldecompraspublicas'],
    hosts: ['portaldecompraspublicas.com.br'],
  },
  {
    slug: 'bll-compras',
    nome: 'BLL Compras',
    site: 'https://bllcompras.com/',
    descricao: 'Bolsa de Licitações e Leilões (BLL).',
    nomes: ['bll compras', 'bllcompras', 'bolsa de licitacoes', 'bll -', 'bll.org'],
    hosts: ['bllcompras.com', 'bll.org.br'],
  },
  {
    slug: 'bnc',
    nome: 'BNC - Bolsa Nacional de Compras',
    site: 'https://bnc.org.br/',
    descricao: 'Bolsa Nacional de Compras.',
    nomes: ['bnc', 'bolsa nacional de compras'],
    hosts: ['bnc.org.br'],
  },
  {
    slug: 'licitanet',
    nome: 'Licitanet',
    site: 'https://licitanet.com.br/',
    descricao: 'Plataforma de pregões eletrônicos.',
    nomes: ['licitanet'],
    hosts: ['licitanet.com.br'],
  },
  {
    slug: 'licitacoes-e',
    nome: 'Licitações-e (Banco do Brasil)',
    site: 'https://www.licitacoes-e.com.br/',
    descricao: 'Portal de licitações do Banco do Brasil.',
    nomes: ['licitacoes-e', 'licitacoes e', 'licitacoese'],
    hosts: ['licitacoes-e.com.br'],
  },
  {
    slug: 'comprasbr',
    nome: 'ComprasBR',
    site: 'https://comprasbr.com.br/',
    descricao: 'Plataforma de compras públicas ComprasBR.',
    nomes: ['comprasbr', 'compras br', 'compras brasil'],
    hosts: ['comprasbr.com.br'],
  },
  {
    slug: 'bbmnet',
    nome: 'BBMNET Licitações',
    site: 'https://bbmnetlicitacoes.com.br/',
    descricao: 'Plataforma de pregões da Bolsa Brasileira de Mercadorias.',
    nomes: ['bbmnet'],
    hosts: ['bbmnet.com.br', 'bbmnetlicitacoes.com.br'],
  },
  {
    slug: 'm2a',
    nome: 'M2A Tecnologia',
    site: 'https://m2atecnologia.com.br/',
    descricao: 'Plataforma de licitações M2A.',
    nomes: ['m2a'],
    hosts: ['m2atecnologia.com.br'],
  },
  {
    slug: 'licitar-digital',
    nome: 'Licitar Digital',
    site: 'https://licitardigital.com.br/',
    descricao: 'Plataforma de licitações Licitar Digital.',
    nomes: ['licitar digital', 'licitardigital'],
    hosts: ['licitardigital.com.br'],
  },
];

export type PortalDaLicitacao = { slug: string; nome: string; conhecido: boolean };

function semAcento(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function slugDePortal(nome: string): string {
  return (
    semAcento(nome)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'portal'
  );
}

/** Domínio do link, sem "www." (vazio quando o texto não é uma URL). */
export function hostDoLink(link: string | null | undefined): string | null {
  const texto = (link ?? '').trim();
  if (!texto) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(texto) ? texto : `https://${texto}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

function porHost(host: string): PortalConhecido | undefined {
  return PORTAIS_CONHECIDOS.find((portal) =>
    portal.hosts.some((dominio) => host === dominio || host.endsWith(`.${dominio}`)),
  );
}

function porNome(nome: string): PortalConhecido | undefined {
  const texto = semAcento(nome);
  // "bnc" e "m2a" são curtos: só valem como palavra inteira, para não casar no meio de outro nome.
  return PORTAIS_CONHECIDOS.find((portal) =>
    portal.nomes.some((trecho) =>
      trecho.length <= 3
        ? new RegExp(`(^|[^a-z0-9])${trecho}([^a-z0-9]|$)`).test(texto)
        : texto.includes(trecho),
    ),
  );
}

/** Prefixo que alguns portais colocam no objeto: "[Portal de Compras Públicas] - Aquisição…". */
function prefixoDoObjeto(objeto: string | null | undefined): string | null {
  const achou = /^\s*\[([^\]]{2,60})\]\s*[-–—]/.exec(objeto ?? '');
  return achou ? achou[1]!.trim() : null;
}

function limpar(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * Portal de uma licitação. A ordem de confiança é: nome informado pelo PNCP, link de origem e,
 * por último, o prefixo do objeto (só quando bate com um portal conhecido). Sem nenhum dos
 * três, volta `null` (a licitação continua na lista, só sem portal).
 */
export function portalDaLicitacao(entrada: {
  usuario?: string | null | undefined;
  link?: string | null | undefined;
  objeto?: string | null | undefined;
}): PortalDaLicitacao | null {
  const usuario = limpar(entrada.usuario ?? '');
  const host = hostDoLink(entrada.link);
  const prefixo = prefixoDoObjeto(entrada.objeto);

  const conhecido =
    (usuario ? porNome(usuario) : undefined) ??
    (host ? porHost(host) : undefined) ??
    (prefixo ? porNome(prefixo) : undefined);
  if (conhecido) return { slug: conhecido.slug, nome: conhecido.nome, conhecido: true };

  if (usuario) return { slug: slugDePortal(usuario), nome: usuario, conhecido: false };
  if (host) return { slug: slugDePortal(host), nome: host, conhecido: false };
  return null;
}

/** Dados de um portal pelo nome canônico (ou pelo slug). */
export function infoDoPortal(nomeOuSlug: string): PortalConhecido | null {
  const texto = nomeOuSlug.trim();
  return (
    PORTAIS_CONHECIDOS.find((portal) => portal.nome === texto || portal.slug === texto) ?? null
  );
}
