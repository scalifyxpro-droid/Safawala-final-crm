/**
 * Auspicious wedding dates supplied by Safawala management.
 *
 * Keep this list in one place so the admin and every staff calendar show the
 * same dates. The source artwork repeats "OCT" for the penultimate 2027 row;
 * that row is November because it follows October and precedes December.
 */
const IMPORTANT_WEDDING_DAYS: Record<string, readonly number[]> = {
  '2026-11': [5, 6, 9, 12, 14, 15, 16, 18, 19, 21, 23, 24, 27, 28],
  '2026-12': [1, 4, 7, 8, 11, 12, 13, 15, 16, 18, 19, 21, 22, 25, 27, 28, 30],
  '2027-01': [14, 15, 18, 19, 20, 24, 26, 27, 30, 31],
  '2027-02': [3, 6, 7, 10, 11, 14, 15, 17, 20, 22, 25, 27],
  '2027-03': [1, 2, 3, 4, 6, 10, 13, 14],
  '2027-04': [18, 22, 23, 25, 26, 27, 28, 30],
  '2027-05': [
    4, 7, 9, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 30, 31,
  ],
  '2027-06': [2, 3, 7, 8, 9, 10, 13, 14, 16, 17, 21, 22, 23, 25, 28, 30],
  '2027-07': [1, 7, 9, 12, 14],
  '2027-08': [1, 3, 5, 6, 9, 11, 12, 14, 15, 17, 18, 21, 23, 24, 27, 29],
  '2027-09': [2, 4, 7, 8, 11, 13, 14, 16, 17, 20, 21, 23, 24, 26, 28, 30],
  '2027-10': [1, 4, 6, 8, 9, 11, 12, 15, 16, 18, 19, 22, 24, 25, 28, 30],
  '2027-11': [2, 5, 7, 9, 12, 13, 14, 16, 19, 21, 23, 25, 26, 29],
  '2027-12': [2, 7, 8, 9, 12, 13, 14, 17, 18, 20, 21, 23, 25, 26, 28, 30],
};

export type ImportantWeddingMonth = {
  year: number;
  month: number;
  days: readonly number[];
};

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function importantWeddingDaysForMonth(year: number, month: number) {
  return IMPORTANT_WEDDING_DAYS[monthKey(year, month)] ?? [];
}

export function nextImportantWeddingMonth(
  year: number,
  month: number,
): ImportantWeddingMonth | null {
  const currentKey = monthKey(year, month);
  const nextKey = Object.keys(IMPORTANT_WEDDING_DAYS)
    .sort()
    .find((key) => key > currentKey);

  if (!nextKey) return null;

  const [nextYear, nextMonth] = nextKey.split('-').map(Number);
  return {
    year: nextYear,
    month: nextMonth - 1,
    days: IMPORTANT_WEDDING_DAYS[nextKey],
  };
}

export function isImportantWeddingDate(
  year: number,
  month: number,
  day: number,
) {
  return importantWeddingDaysForMonth(year, month).includes(day);
}
