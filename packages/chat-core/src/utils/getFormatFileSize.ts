export const getFormatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024; // or 1000 for decimal
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};
