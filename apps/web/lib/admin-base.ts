/**
 * Base das páginas de administração em que a pessoa está: a Administração da mentoria vive em
 * `/gestao`, a profissional em `/admin`. As fichas e as listas de usuários servem às duas.
 */
export function adminBase(pathname: string | null | undefined): '/gestao' | '/admin' {
  return pathname === '/gestao' || pathname?.startsWith('/gestao/') ? '/gestao' : '/admin';
}
