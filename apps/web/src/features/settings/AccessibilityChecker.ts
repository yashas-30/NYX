// Accessibility contrast checks are handled by Tailwind's design system
// and tested via automated a11y tooling in CI. This class is intentionally
// a no-op; remove usages if encountered.
export class AccessibilityChecker {
  /** @deprecated Use automated a11y testing instead (e.g. axe-core in Playwright). */
  static runCheck(_theme: string): void {
    // Intentional no-op: inline toast-based contrast checks were removed
    // because they fired on every theme change and annoyed users.
    // Proper a11y validation belongs in CI, not runtime UI toasts.
  }
}
