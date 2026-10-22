/** Polska odmiana: 1 termin, 2–4 terminy, 5+ terminów (12–14 też „terminów”). */
export const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many
