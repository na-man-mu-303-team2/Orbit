export type RedesignPalette = {
  background: string;
  onSurface: string;
  outlineVariant: string;
  primary: string;
  primaryContainer: string;
  primaryFixedDim: string;
  secondary: string;
  surface: string;
  surfaceContainer: string;
};

const redesignPaletteTokens: Record<keyof RedesignPalette, string> = {
  background: "--redesign-color-background",
  onSurface: "--redesign-color-on-surface",
  outlineVariant: "--redesign-color-outline-variant",
  primary: "--redesign-color-primary",
  primaryContainer: "--redesign-color-primary-container",
  primaryFixedDim: "--redesign-color-primary-fixed-dim",
  secondary: "--redesign-color-secondary",
  surface: "--redesign-color-surface",
  surfaceContainer: "--redesign-color-surface-container",
};

export function resolveRedesignPalette(
  source?: Element | null,
): RedesignPalette | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const tokenSource = source ?? document.documentElement;
  const computedStyle = window.getComputedStyle(tokenSource);
  const paletteEntries = Object.entries(redesignPaletteTokens).map(
    ([role, token]) => [role, computedStyle.getPropertyValue(token).trim()],
  );

  if (paletteEntries.some(([, value]) => !value)) {
    return null;
  }

  return Object.fromEntries(paletteEntries) as RedesignPalette;
}
