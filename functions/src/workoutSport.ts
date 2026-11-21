export type ErgSport = 'rower' | 'bike' | 'skierg';

export function normalizeWorkoutSport(sport: string): string {
  return sport === 'bikeerg' ? 'bike' : sport;
}

export function asErgSport(sport: string | null | undefined): ErgSport | undefined {
  if (!sport) return undefined;
  const normalized = normalizeWorkoutSport(sport);
  if (normalized === 'rower' || normalized === 'bike' || normalized === 'skierg') return normalized;
  return undefined;
}
