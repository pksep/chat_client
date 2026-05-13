export const normalizeDateValue = (
  value: Date | string | null | undefined
): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsedValue = new Date(value);

  return Number.isNaN(parsedValue.getTime()) ? null : parsedValue;
};
