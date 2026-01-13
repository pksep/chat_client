export const getFormatFileSize = (bytes?: number): string => {
  if (!bytes || bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export const getShortName = (name: string): string => {
  if (!name) return '';

  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1) return name;

  const base = name.slice(0, lastDot);
  const ext = name.slice(lastDot);

  if (base.length <= 25) return name;

  const start = base.slice(0, 10);
  const end = base.slice(-10);

  return `${start} ... ${end}${ext}`;
};
