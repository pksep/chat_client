const formatFilesLabel = (count: number): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} файл`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} файла`;
  }

  return `${count} файлов`;
};

export const getShareSelectionSummaryLabel = (files: File[]): string => {
  if (!files.length) {
    return '0 файлов';
  }

  const counts = files.reduce(
    (acc, file) => {
      if (file.type.startsWith('image/')) {
        acc.photos += 1;
        return acc;
      }

      if (file.type.startsWith('video/')) {
        acc.videos += 1;
        return acc;
      }

      acc.files += 1;
      return acc;
    },
    {
      files: 0,
      photos: 0,
      videos: 0
    }
  );

  const parts = [
    counts.files > 0 ? formatFilesLabel(counts.files) : '',
    counts.photos > 0 ? `${counts.photos} фото` : '',
    counts.videos > 0 ? `${counts.videos} видео` : ''
  ].filter(Boolean);

  return parts.join(', ');
};
