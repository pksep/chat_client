import { ref, onUnmounted } from 'vue';

export const useTime = () => {
  const time = ref<string>('');
  const interval = setInterval(() => {
    time.value = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }, 1000);

  onUnmounted(() => clearInterval(interval));

  return { time };
};

export const formatTime = (date: Date = new Date()) => {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatDay = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long'
  });
};

export function isTimeAfter(time1: Date, time2: Date): boolean {
  return time1.getTime() > time2.getTime();
}
