/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const night = {
  text: '#F2F6FA',
  tint: '#67A8FF',
  background: '#0D1117',
  foreground: '#F2F6FA',
  card: '#151C25',
  cardForeground: '#F2F6FA',
  primary: '#67A8FF',
  primaryForeground: '#09111D',
  secondary: '#1B2633',
  secondaryForeground: '#D7E3EF',
  muted: '#17212C',
  mutedForeground: '#8B9BAE',
  accent: '#183A5D',
  accentForeground: '#B9D9FF',
  destructive: '#F27D86',
  destructiveForeground: '#240C11',
  border: '#263545',
  input: '#1C2937',
  surface: '#111821',
  surfaceRaised: '#1A2531',
  success: '#63D6A0',
  warning: '#E8B96A',
  offline: '#8B9BAE',
  overlay: '#0A0E14',
};

const colors = {
  light: night,
  dark: night,
  radius: 14,
};

export default colors;
