// Which logo the flow shows (components/useBranding). Pure, so it is testable
// without React Native.

/**
 * The logo to show. Unset is the organisation's logo, as 'default' is
 * (decision 2026-11-13); '' is a workflow's "None"; anything else a URL.
 */
export function resolveLogo(configured: string | undefined, orgLogo: string | null | undefined): string | null {
  return configured === undefined || configured === 'default' ? orgLogo ?? null : configured || null;
}
