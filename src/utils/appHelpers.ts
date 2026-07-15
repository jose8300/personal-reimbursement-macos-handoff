import { getDateOnly, getMonth } from './format';
import { adjustedWorkdays, holidayRanges } from '../config/holidayWindows';
import type { ExpenseRecord } from '../types/expense';

type SimpleFilter = {
  mode: 'include' | 'exclude';
  values: string[];
};

export function getRecordReimbursementMonth(record: ExpenseRecord) {
  return record.reimbursementMonth || getMonth(record.dateTime);
}

export function createMonthSelectOptions(records: ExpenseRecord[]) {
  const years = new Set<string>();
  records.forEach((record) => {
    const month = getRecordReimbursementMonth(record);
    if (/^\d{4}-\d{2}$/.test(month)) years.add(month.slice(0, 4));
  });
  if (!years.size) years.add(String(new Date().getFullYear()));
  return Array.from(years)
    .sort()
    .flatMap((year) =>
      Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`),
    );
}

export function valueMatchesFilter(value: string, filter: SimpleFilter) {
  if (!filter.values.length) return true;
  const isSelected = filter.values.includes(value);
  return filter.mode === 'include' ? isSelected : !isSelected;
}

export function insertAfter<T>(items: T[], target: T, item: T) {
  if (items.includes(item)) return items;
  const index = items.indexOf(target);
  if (index < 0) return [...items, item];
  return [...items.slice(0, index + 1), item, ...items.slice(index + 1)];
}

export function reorderItem<T>(items: T[], draggedItem: T, targetItem: T, placement: 'before' | 'after') {
  if (draggedItem === targetItem) return items;
  const withoutDragged = items.filter((item) => item !== draggedItem);
  const targetIndex = withoutDragged.indexOf(targetItem);
  if (targetIndex < 0) return items;
  const next = [...items];
  const insertIndex = placement === 'before' ? targetIndex : targetIndex + 1;
  next.splice(0, next.length, ...withoutDragged.slice(0, insertIndex), draggedItem, ...withoutDragged.slice(insertIndex));
  return next;
}

export function dateToTime(date: string) {
  const match = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return NaN;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

export function addDays(date: string, days: number) {
  const time = dateToTime(date);
  if (Number.isNaN(time)) return '';
  const next = new Date(time);
  next.setDate(next.getDate() + days);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getRecordText(record: ExpenseRecord) {
  return [
    record.transactionType,
    record.counterparty,
    record.productName,
    record.billRemark,
    record.merchant,
    record.note,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function isLegalHolidayDate(dateTime: string) {
  const date = getDateOnly(dateTime);
  return holidayRanges.some((range) => date >= range.start && date <= range.end);
}

export function isAdjustedWorkday(dateTime: string) {
  return adjustedWorkdays.includes(getDateOnly(dateTime));
}

export function pushVersion<T>(versions: T[], version: T, max: number): T[] {
  const next = [version, ...versions];
  return next.length > max ? next.slice(0, max) : next;
}
