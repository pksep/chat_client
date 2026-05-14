import { ref, onUnmounted } from 'vue';

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
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
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

  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit'
  });
};

export const formatDay = (timestamp: Date): string => {
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long'
  });
};

export function isTimeAfter(time1: Date, time2: Date): boolean {
  return time1.getTime() > time2.getTime();
}
