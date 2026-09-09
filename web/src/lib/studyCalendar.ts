import type { Study } from '../api/personal';

export function studyMonth(today: string, offset = 0) {
  // Календарь следует дате серии с сервера; часы и часовой пояс браузера
  // не должны переносить занятие на соседний день.
  const parsed = new Date(`${today}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  const first = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + offset, 1));
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return {
    key: first.toISOString().slice(0, 7),
    label: first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    padding: (first.getUTCDay() + 6) % 7,
    days: Array.from({ length: count }, (_, i) => `${first.toISOString().slice(0, 7)}-${String(i + 1).padStart(2, '0')}`),
  };
}

export function latestStudy(initial?: Study, live?: Study | null): Study | undefined {
  if (!initial) return live ?? undefined;
  if (!live) return initial;
  // Свежая серверная статистика важнее старого локального снимка.
  return (Date.parse(live.asOf ?? '') || 0) >= (Date.parse(initial.asOf ?? '') || 0) ? live : initial;
}
