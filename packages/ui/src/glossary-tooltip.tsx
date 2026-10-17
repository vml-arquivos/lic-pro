import type { HTMLAttributes } from 'react';

export type GlossaryTooltipProps = HTMLAttributes<HTMLSpanElement> & {
  term: string;
  simpleDefinition: string;
};

export function GlossaryTooltip({ term, simpleDefinition, ...props }: GlossaryTooltipProps) {
  return (
    <span {...props} className={`glossary-term ${props.className ?? ''}`}>
      <abbr title={simpleDefinition}>{term}</abbr>
    </span>
  );
}
