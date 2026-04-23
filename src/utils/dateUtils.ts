import { ref } from 'vue';

const now = ref(new Date());

// Обновляем "текущее время" каждую минуту для реактивности во всем приложении
setInterval(() => {
  now.value = new Date();
}, 60000);

export const formatLastSeen = (lastOnline: string | Date | null): string => {
  if (!lastOnline) return 'Онлайн';

  const date = lastOnline instanceof Date ? lastOnline : new Date(lastOnline);
  const diffInSeconds = Math.floor(
    (now.value.getTime() - date.getTime()) / 1000
  );

  if (diffInSeconds < 60) {
    return 'Был(а) только что';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `Был(а) ${diffInMinutes} ${getRussianPlural(diffInMinutes, 'минуту', 'минуты', 'минут')} назад`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `Был(а) ${diffInHours} ${getRussianPlural(diffInHours, 'час', 'часа', 'часов')} назад`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `Был(а) ${diffInDays} ${getRussianPlural(diffInDays, 'день', 'дня', 'дней')} назад`;
  }

  return 'Был(а) давно';
};

const getRussianPlural = (
  n: number,
  one: string,
  two: string,
  five: string
): string => {
  const nAbs = Math.abs(n) % 100;
  const n1 = nAbs % 10;
  if (nAbs > 10 && nAbs < 20) return five;
  if (n1 > 1 && n1 < 5) return two;
  if (n1 === 1) return one;
  return five;
};
