export function getMLBWeek(date: Date, seasonStartDate: Date): { weekNumber: number; weekYear: number } {
  const msPerDay = 1000 * 60 * 60 * 24;
  const msPerWeek = msPerDay * 7;

  const daysSinceStart = Math.floor((date.getTime() - seasonStartDate.getTime()) / msPerDay);
  const weekNumber = Math.floor(daysSinceStart / 7) + 1;

  return {
    weekNumber: Math.max(1, weekNumber),
    weekYear: date.getFullYear()
  };
}

export function getCurrentMLBWeek(): { weekNumber: number; weekYear: number } {
  const seasonStart = new Date('2026-03-26');
  return getMLBWeek(new Date(), seasonStart);
}

export function getWeekDateRange(weekNumber: number, weekYear: number): { start: Date; end: Date } {
  const seasonStart = new Date('2026-03-26');
  const msPerDay = 1000 * 60 * 60 * 24;

  const daysToAdd = (weekNumber - 1) * 7;
  const weekStart = new Date(seasonStart.getTime() + (daysToAdd * msPerDay));
  const weekEnd = new Date(weekStart.getTime() + (6 * msPerDay));

  return { start: weekStart, end: weekEnd };
}

export function formatWeekRange(weekNumber: number, weekYear: number): string {
  const { start, end } = getWeekDateRange(weekNumber, weekYear);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return `${formatDate(start)} - ${formatDate(end)}`;
}

export function getAvailableWeeks(): Array<{ weekNumber: number; weekYear: number; label: string }> {
  const current = getCurrentMLBWeek();
  const weeks = [];

  for (let i = current.weekNumber; i >= 1; i--) {
    weeks.push({
      weekNumber: i,
      weekYear: current.weekYear,
      label: `Week ${i} (${formatWeekRange(i, current.weekYear)})`
    });
  }

  return weeks;
}
