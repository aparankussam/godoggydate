// shared/temperament.ts
// Temperament chips are stored as display strings on dog docs. The old option
// "Social butterfly 🦋" echoed a Dogtype name, so it now reads "Loves every dog 🎉".
// Stored values are never migrated: every render and every editor maps through
// temperamentLabel, so old and new values look and select the same.

export const TEMPERAMENT_LEGACY: Record<string, string> = {
  'Social butterfly 🦋': 'Loves every dog 🎉',
};

export function temperamentLabel(value: string): string {
  return TEMPERAMENT_LEGACY[value] ?? value;
}
