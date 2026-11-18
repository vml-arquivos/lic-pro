'use client';

import './mercado.css';

export type MetaDoDado = {
  consultado_em: string;
  idade_segundos: number;
  origem: 'cache' | 'fonte' | 'antigo';
  /** O dado é mais velho que a validade e a atualização falhou ou está em andamento. */
  desatualizado: boolean;
  atualizando: boolean;
  parcial: boolean;
};

export function idadeEmTexto(segundos: number): string {
  if (segundos < 60) return 'agora há pouco';
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.floor(horas / 24)} dia(s)`;
}

/** Uma linha curta: fonte, idade e quanto foi consultado; avisa se o dado pode estar velho. */
export function SituacaoDoDado({
  fonte,
  meta,
  cobertura,
}: Readonly<{ fonte: string; meta: MetaDoDado | null | undefined; cobertura?: string | null }>) {
  if (!meta) return null;
  const partes = [fonte, `consultado ${idadeEmTexto(meta.idade_segundos)}`];
  if (cobertura) partes.push(cobertura);
  return (
    <p className="mk-situacao" role="status">
      <span>{partes.join(' · ')}</span>
      {meta.atualizando ? <strong> · Atualizando…</strong> : null}
      {meta.desatualizado && !meta.atualizando ? (
        <strong className="mk-situacao-aviso">
          {' '}
          · Não foi possível atualizar. Mostrando o último dado.
        </strong>
      ) : null}
    </p>
  );
}
