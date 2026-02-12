/**
 * Shared name matching utilities
 * Used by Stripe payment matching and Bokun reverse matching
 */

/**
 * Normalize a name into comparable tokens: lowercase, strip accents, split by whitespace
 */
export function normalizeNameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * Check if two names match: all tokens from the shorter name must appear in the longer name.
 * Handles accent differences, different orderings, and middle names.
 */
export function namesMatch(name1: string, name2: string): boolean {
  const tokens1 = normalizeNameTokens(name1);
  const tokens2 = normalizeNameTokens(name2);

  if (tokens1.length === 0 || tokens2.length === 0) return false;

  const [shorter, longer] = tokens1.length <= tokens2.length
    ? [tokens1, tokens2]
    : [tokens2, tokens1];

  const matchCount = shorter.filter(t => longer.includes(t)).length;
  return matchCount === shorter.length;
}
