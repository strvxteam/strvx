export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

export function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function formatHour(h: number): string {
  const hour = Math.floor(h);
  const min = Math.round((h - hour) * 60);
  const ampm = hour >= 12 ? "pm" : "am";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  if (min === 0) return `${hour12}${ampm}`;
  return `${hour12}:${String(min).padStart(2, "0")}${ampm}`;
}

/**
 * Generate a 6x7 grid of dates for a given month (Monday-start).
 */
export function getMonthGrid(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  // Monday=0, Tuesday=1, ..., Sunday=6
  const startDow = (firstDay.getDay() + 6) % 7;
  const gridStart = addDays(firstDay, -startDow);

  const rows: Date[][] = [];
  for (let row = 0; row < 6; row++) {
    const week: Date[] = [];
    for (let col = 0; col < 7; col++) {
      week.push(addDays(gridStart, row * 7 + col));
    }
    rows.push(week);
  }
  return rows;
}
