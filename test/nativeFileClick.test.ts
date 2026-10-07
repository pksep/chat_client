import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { IMedia } from '../src/components/interfaces/interfaces';

const getFileStatus = mock(async () => ({
  downloaded: false,
  path: '',
  fileName: 'report.docx',
  mimeType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}));
const downloadFileToDownloads = mock(async () => ({
  path: 'content://downloads/report.docx',
  fileName: 'report.docx',
  mimeType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}));

mock.module('../src/services/native-file-bridge', () => ({
  isAndroidNativePlatform: () => true,
  NativeFile: {
    addListener: async () => ({ remove: async () => {} }),
    downloadFileToDownloads,
    getFileStatus
  }
}));

mock.module('../src/services/useConfig', () => ({
  getConfig: () => ({ CHAT_PATH_TO_FILE_CDN: 'https://chat.example.com' })
}));

const {
  getNativeFileDownloadState,
  handleNativeFileClick,
  refreshNativeFileDownloadStatus
} = await import('../src/services/useNativeFile');

const media = {
  id: 'first-click-download',
  path: 'files/report.docx',
  originName: 'report.docx',
  size: 1024
} as IMedia;

describe('Android file click', () => {
  beforeEach(() => {
    getFileStatus.mockClear();
    downloadFileToDownloads.mockClear();
  });

  test('starts a known missing file download on the first click without another status check', async () => {
    expect(await refreshNativeFileDownloadStatus(media)).toBe(false);
    expect(getNativeFileDownloadState(media).phase).toBe('not-downloaded');
    expect(getFileStatus).toHaveBeenCalledTimes(1);

    const click = handleNativeFileClick(media);

    expect(getNativeFileDownloadState(media).phase).toBe('downloading');
    expect(getFileStatus).toHaveBeenCalledTimes(1);

    await click;

    expect(downloadFileToDownloads).toHaveBeenCalledTimes(1);
    expect(getNativeFileDownloadState(media).phase).toBe('downloaded');
  });
});
