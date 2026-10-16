/**
 * Helper to correctly pluralize Russian words according to numeric values.
 * forms: [one, few, many] e.g. ['день', 'дня', 'дней'], ['запись', 'записи', 'записей']
 */
export function pluralizeRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.floor(n)) % 100
  const n1 = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (n1 > 1 && n1 < 5) return forms[1]
  if (n1 === 1) return forms[0]
  return forms[2]
}
