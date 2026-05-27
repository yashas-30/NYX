/**
 * Aether Arena - Design Tokens
 * Centralized source of truth for the visual theme.
 */

export const THEME = {
  colors: {
    background: 'var(--background)',
    surface: 'var(--card)',
    surfaceElevated: 'var(--secondary)',
    accent: 'var(--accent)',
    textPrimary: 'var(--foreground)',
    textSecondary: 'var(--muted-foreground)',
    border: 'var(--border)',
    primary: 'var(--primary)',
  },
  spacing: {
    sidebarWidth: '240px',
    containerPadding: '2rem',
    gapDense: '0.5rem',
    gapNormal: '1.5rem',
  },
  radius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '1rem',
  },
  animations: {
    spring: {
      stiffness: 120,
      damping: 25,
    },
    microGlow: {
      opacity: [0.1, 0.3, 0.1],
      transition: { duration: 3, repeat: Infinity, ease: "easeInOut" }
    }
  }
};
