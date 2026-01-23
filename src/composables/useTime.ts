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

export const formatDay = (timestamp: Date): string => {
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long'
  });
};

export function isTimeAfter(time1: Date, time2: Date): boolean {
  return time1.getTime() > time2.getTime();
}
