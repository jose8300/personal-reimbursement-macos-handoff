export function formatCurrency(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function normalizeDateInput(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }

  if (typeof value === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  }

  return String(value ?? '').trim();
}

export function getDateOnly(dateTime: string) {
  return normalizeDateInput(dateTime).slice(0, 10).replace(/\//g, '-');
}

export function getMonth(dateTime: string) {
  return getDateOnly(dateTime).slice(0, 7);
}

export function getWeekdayLabel(dateTime: string) {
  const dateOnly = getDateOnly(dateTime);
  const match = dateOnly.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return '';

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return '';

  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
}

export function formatDateTimeWithWeekday(dateTime: string) {
  const weekday = getWeekdayLabel(dateTime);
  return weekday ? `${dateTime} ${weekday}` : dateTime;
}

export function parseAmount(value: unknown) {
  const raw = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[￥¥元\s]/g, '')
    .replace(/[()]/g, '-')
    .trim();
  const match = raw.match(/-?\d+(\.\d+)?/);
  return match ? Math.abs(Number(match[0])) : 0;
}
