export type OpeningTimeParts = { hour: number; minute: number; period: 'AM' | 'PM' };

export function openingTimeParts(value: string): OpeningTimeParts {
  const valid = /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
  const [hour, minute] = valid ? value.split(':').map(Number) : [0, 0];
  return { hour: hour % 12 || 12, minute, period: hour >= 12 ? 'PM' : 'AM' };
}

export function openingTimeValue({ hour, minute, period }: OpeningTimeParts): string {
  const hour24 = hour % 12 + (period === 'PM' ? 12 : 0);
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
