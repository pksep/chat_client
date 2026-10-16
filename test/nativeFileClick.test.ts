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
const openDownloadedFile = mock(async (_options: Record<string, unknown>) => ({
  path: 'content://downloads/report.docx',
  mimeType: 'application/pdf'
}));
const recordTelemetryEvent = mock((_event: any) => {});
mock.module('../src/services/useTelemetry', () => ({
  createTelemetryTraceId: () => 'file-open-test',
  recordTelemetryEvent
}));

mock.module('../src/services/native-file-bridge', () => ({
  isAndroidNativePlatform: () => true,
  NativeFile: {
    addListener: async () => ({ remove: async () => {} }),
    downloadFileToDownloads,
    getFileStatus,
    openDownloadedFile
  }
}));

mock.module('../src/services/useConfig', () => ({
  getConfig: () => ({ CHAT_PATH_TO_FILE_CDN: 'https://chat.example.com' })
}));

const {
  getNativeFileDownloadState,
  downloadNativeFileToDownloads,
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
    getFileStatus.mockReset().mockResolvedValue({
      downloaded: false,
      path: '',
      fileName: 'report.docx',
      mimeType: 'application/pdf'
    });
    downloadFileToDownloads.mockClear();
    openDownloadedFile.mockClear();
    recordTelemetryEvent.mockClear();
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

  const local = {
    downloaded: true,
    path: 'content://downloads/42',
    fileName: 'report.pdf',
    mimeType: 'application/pdf'
  };
  let id = 0;
  const pdf = () => ({
    ...media,
    id: String(++id),
    path: `files/${id}.pdf`,
    originName: 'report.pdf'
  });

  test('preserves a local URI and reuses it after remount without another lookup', async () => {
    const file = pdf();
    getFileStatus.mockResolvedValue(local);
    await refreshNativeFileDownloadStatus(file);
    await refreshNativeFileDownloadStatus(file);
    await handleNativeFileClick(file);
    expect(getFileStatus).toHaveBeenCalledTimes(1);
    expect(openDownloadedFile.mock.calls[0][0].localUri).toBe(local.path);
    expect(downloadFileToDownloads).not.toHaveBeenCalled();
  });

  test('joins an in-flight status check and opens once for repeated clicks', async () => {
    const file = pdf();
    let resolve!: (value: typeof local) => void;
    getFileStatus.mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const checking = refreshNativeFileDownloadStatus(file);
    const first = handleNativeFileClick(file);
    const second = handleNativeFileClick(file);
    expect(
      recordTelemetryEvent.mock.calls.some(
        ([event]) => event.name === 'chat.file_open.clicked'
      )
    ).toBe(true);
    expect(openDownloadedFile).not.toHaveBeenCalled();
    resolve(local);
    await Promise.all([checking, first, second]);
    expect(getFileStatus).toHaveBeenCalledTimes(1);
    expect(openDownloadedFile).toHaveBeenCalledTimes(1);
    expect(openDownloadedFile.mock.calls[0][0].localUri).toBe(local.path);
    const launched = recordTelemetryEvent.mock.calls.find(
      ([event]) => event.name === 'chat.file_open.viewer_launched'
    )?.[0];
    expect(launched?.traceId).toBe('file-open-test');
    expect(launched?.payload.statusCheckMs).toBeNumber();
  });

  test('shows opening and coalesces repeated taps until native handoff completes', async () => {
    const file = pdf();
    getFileStatus.mockResolvedValue(local);
    await refreshNativeFileDownloadStatus(file);
    let resolve!: (value: { path: string; mimeType: string }) => void;
    openDownloadedFile.mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const first = handleNativeFileClick(file);
    const second = handleNativeFileClick(file);
    expect(getNativeFileDownloadState(file).phase).toBe('opening');
    await refreshNativeFileDownloadStatus(file, true);
    expect(getNativeFileDownloadState(file).phase).toBe('opening');
    resolve(local);
    await Promise.all([first, second]);
    expect(openDownloadedFile).toHaveBeenCalledTimes(1);
    expect(getFileStatus).toHaveBeenCalledTimes(1);
    expect(getNativeFileDownloadState(file).phase).toBe('downloaded');
  });

  test('viewer failure keeps the download available for another opening attempt', async () => {
    const file = pdf();
    getFileStatus.mockResolvedValue(local);
    await refreshNativeFileDownloadStatus(file);
    openDownloadedFile.mockRejectedValueOnce({ code: 'VIEWER_UNAVAILABLE' });
    await handleNativeFileClick(file);
    expect(getNativeFileDownloadState(file).localUri).toBe(local.path);
    await handleNativeFileClick(file);
    expect(downloadFileToDownloads).not.toHaveBeenCalled();
    expect(openDownloadedFile).toHaveBeenCalledTimes(2);
  });

  test('a deleted file can be downloaded again on the next tap', async () => {
    const file = pdf();
    getFileStatus.mockResolvedValue(local);
    await refreshNativeFileDownloadStatus(file);
    openDownloadedFile.mockRejectedValueOnce({ code: 'FILE_NOT_FOUND' });
    await handleNativeFileClick(file);
    expect(getNativeFileDownloadState(file).phase).toBe('not-downloaded');
    await handleNativeFileClick(file);
    expect(downloadFileToDownloads).toHaveBeenCalledTimes(1);
  });

  test('handoff telemetry contains neither signed URLs nor local paths', async () => {
    const file = pdf();
    getFileStatus.mockResolvedValue(local);
    await refreshNativeFileDownloadStatus(file);
    await handleNativeFileClick(file);
    const events = recordTelemetryEvent.mock.calls.map(([event]) => event);
    expect(events.map(event => event.name)).toContain(
      'chat.file_open.viewer_launched'
    );
    expect(JSON.stringify(events)).not.toContain('content://');
    expect(JSON.stringify(events)).not.toContain('https://');
  });

  test('late missing status cannot overwrite a file downloaded in the meantime', async () => {
    const file = pdf();
    let resolve!: (value: typeof local) => void;
    getFileStatus.mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const checking = refreshNativeFileDownloadStatus(file);
    expect(await downloadNativeFileToDownloads(file)).toBe(true);
    const savedUri = getNativeFileDownloadState(file).localUri;
    resolve({ ...local, downloaded: false });
    await checking;
    expect(getNativeFileDownloadState(file).phase).toBe('downloaded');
    expect(getNativeFileDownloadState(file).localUri).toBe(savedUri);
    await handleNativeFileClick(file);
    expect(openDownloadedFile.mock.calls[0][0].localUri).toBe(savedUri);
    expect(downloadFileToDownloads).toHaveBeenCalledTimes(1);
  });

  test('a failed status check can be retried without downloading an existing file', async () => {
    const file = pdf();
    getFileStatus.mockRejectedValueOnce(new Error('MediaStore занят'));
    expect(await refreshNativeFileDownloadStatus(file)).toBe(false);
    expect(getNativeFileDownloadState(file).phase).toBe('unknown');
    getFileStatus.mockResolvedValue(local);
    await handleNativeFileClick(file);
    expect(getFileStatus).toHaveBeenCalledTimes(2);
    expect(openDownloadedFile).toHaveBeenCalledTimes(1);
    expect(downloadFileToDownloads).not.toHaveBeenCalled();
  });

  test('failed download leaves the next tap able to retry', async () => {
    const file = pdf();
    downloadFileToDownloads.mockRejectedValueOnce(new Error('Сеть недоступна'));
    await Promise.all([
      handleNativeFileClick(file),
      handleNativeFileClick(file)
    ]);
    expect(getNativeFileDownloadState(file).phase).toBe('error');
    expect(downloadFileToDownloads).toHaveBeenCalledTimes(1);
    await handleNativeFileClick(file);
    expect(downloadFileToDownloads).toHaveBeenCalledTimes(2);
    expect(getNativeFileDownloadState(file).phase).toBe('downloaded');
  });
});
