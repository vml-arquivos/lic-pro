/**
 * Fonte única da identidade visual do Licite Comigo.
 * Todos os valores abaixo são PROVISÓRIOS e devem ser substituídos quando a marca oficial chegar.
 */
export const brandTokens = {
  colors: {
    light: {
      background: 'hsl(0 0% 100%)',
      foreground: 'hsl(222 47% 11%)',
      muted: 'hsl(210 40% 96%)',
      mutedForeground: 'hsl(215 16% 47%)',
      primary: 'hsl(222 47% 11%)',
      primaryForeground: 'hsl(210 40% 98%)',
      border: 'hsl(214 32% 91%)',
      ring: 'hsl(215 20% 65%)',
    },
    dark: {
      background: 'hsl(222 47% 11%)',
      foreground: 'hsl(210 40% 98%)',
      muted: 'hsl(217 33% 18%)',
      mutedForeground: 'hsl(215 20% 65%)',
      primary: 'hsl(210 40% 98%)',
      primaryForeground: 'hsl(222 47% 11%)',
      border: 'hsl(217 33% 24%)',
      ring: 'hsl(215 20% 65%)',
    },
  },
  typography: {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    display: 'ui-sans-serif, system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, monospace',
  },
  radii: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 hsl(222 47% 11% / 0.05)',
    md: '0 4px 12px hsl(222 47% 11% / 0.08)',
  },
  spacing: {
    page: '1.5rem',
    section: '4rem',
  },
} as const;
