export const compactPersonName = (value?: string | null): string => {
  const normalizedName = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  const parts = normalizedName.split(' ');

  if (parts.length !== 3) {
    return normalizedName;
  }

  const [surname, firstName, middleName] = parts;
  const firstInitial = firstName.match(/\p{L}/u)?.[0];
  const middleInitial = middleName.match(/\p{L}/u)?.[0];

  if (!surname || !firstInitial || !middleInitial) {
    return normalizedName;
  }

  return `${surname} ${firstInitial.toUpperCase()}. ${middleInitial.toUpperCase()}.`;
};
