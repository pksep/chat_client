import { ref, onUnmounted } from 'vue';

const dayFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC'
});
const listDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC'
});
// Локальное смещение берём у самой даты: DST и смена часового пояса не устаревают.
const formatLocalDate = (date: Date, formatter: Intl.DateTimeFormat): string =>
  Number.isNaN(date.getTime())
    ? 'Invalid Date'
    : formatter.format(date.getTime() - date.getTimezoneOffset() * 60_000);

export const useTime = (date: Date = new Date()) => {
  const time = ref<string>('');
  const interval = setInterval(() => {
    time.value = date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }, 1000);

  onUnmounted(() => clearInterval(interval));

  return { time };
};

export const formatTime = (date: Date = new Date()) => {
  if (Number.isNaN(date.getTime())) return 'Invalid Date';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const formatListTime = (date: Date = new Date()): string => {
  const timestamp = date.getTime();

  if (Number.isNaN(timestamp)) {
    return '';
  }

  const diffMs = Date.now() - timestamp;
  const dayMs = 24 * 60 * 60 * 1000;

  if (diffMs < dayMs) {
    return formatTime(date);
  }

  return formatLocalDate(date, listDateFormatter);
};

export const formatDay = (timestamp: Date): string => {
  return formatLocalDate(new Date(timestamp), dayFormatter);
};

export function isTimeAfter(time1: Date, time2: Date): boolean {
  return time1.getTime() > time2.getTime();
}
