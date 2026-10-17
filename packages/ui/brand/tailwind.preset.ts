/**
 * PROVISÓRIO: o preset aponta apenas para tokens CSS para que a identidade seja trocada em um lugar.
 */
export const liciteComigoTailwindPreset = {
  theme: {
    extend: {
      colors: {
        background: 'var(--lc-color-background)',
        foreground: 'var(--lc-color-foreground)',
        muted: 'var(--lc-color-muted)',
        'muted-foreground': 'var(--lc-color-muted-foreground)',
        primary: 'var(--lc-color-primary)',
        'primary-foreground': 'var(--lc-color-primary-foreground)',
        border: 'var(--lc-color-border)',
        ring: 'var(--lc-color-ring)',
      },
      borderRadius: {
        sm: 'var(--lc-radius-sm)',
        md: 'var(--lc-radius-md)',
        lg: 'var(--lc-radius-lg)',
        full: 'var(--lc-radius-full)',
      },
      boxShadow: {
        sm: 'var(--lc-shadow-sm)',
        md: 'var(--lc-shadow-md)',
      },
      fontFamily: {
        sans: 'var(--lc-font-sans)',
        display: 'var(--lc-font-display)',
        mono: 'var(--lc-font-mono)',
      },
      spacing: {
        page: 'var(--lc-space-page)',
        section: 'var(--lc-space-section)',
      },
    },
  },
};

export default liciteComigoTailwindPreset;
