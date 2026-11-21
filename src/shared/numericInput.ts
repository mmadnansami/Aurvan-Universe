/**
 * Helpers for controlled integer inputs that allow clearing to an empty string
 * without snapping back to "0" while the user edits or replaces digits.
 */

export function sanitizeDigitInput(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return '';
  // Collapse leading zeros only when followed by another digit (e.g. "05" -> "5").
  return digits.replace(/^0+(?=\d)/, '');
}

export function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export function parseIntInRange(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
