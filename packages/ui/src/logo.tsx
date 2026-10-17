import type { HTMLAttributes } from 'react';

export function Logo(props: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...props} aria-label="Licite Comigo">
      Licite Comigo
    </span>
  );
}
