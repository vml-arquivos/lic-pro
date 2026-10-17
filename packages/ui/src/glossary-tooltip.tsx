import type { HTMLAttributes } from 'react';

export type GlossaryTooltipProps = HTMLAttributes<HTMLSpanElement> & {
  term: string;
  simpleDefinition: string;
  status?: 'rascunho_para_revisao' | 'publicado';
};

export function GlossaryTooltip({
  term,
  simpleDefinition,
  status = 'rascunho_para_revisao',
  ...props
}: GlossaryTooltipProps) {
  const reviewNotice =
    status === 'rascunho_para_revisao' ? ' conteúdo em revisão, confirme na norma vigente.' : '';
  return (
    <span {...props} className={`glossary-term ${props.className ?? ''}`}>
      <abbr title={`${simpleDefinition}${reviewNotice}`}>{term}</abbr>
    </span>
  );
}
