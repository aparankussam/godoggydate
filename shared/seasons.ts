// shared/seasons.ts
// Calendar windows for seasonal features. Pure and dependency-free so the web
// profile page (and anything else) can ask "is it that time of year?" and tests
// can pin it down without touching a clock.

/**
 * National Dog Day is August 26. The "Day 1 vs Day N" card is built around it,
 * so it shows for a window around the day, not the whole year:
 * August 20 through September 5, inclusive, in the viewer's local calendar.
 */
export function isNationalDogDaySeason(now: Date): boolean {
  const month = now.getMonth(); // 0 = January
  const day = now.getDate();
  if (month === 7) return day >= 20; // August 20-31
  if (month === 8) return day <= 5; // September 1-5
  return false;
}
