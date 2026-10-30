import { describe, it, expect } from 'bun:test';
import { snapshotFile } from '../src/utils/snapshot-file';

describe('копия временного файла камеры', () => {
  for (const [name, type] of [
    ['IMG_1234.jpeg', 'image/jpeg'],
    ['IMG_1234.MOV', 'video/quicktime']
  ]) {
    it(`сохраняет байты и метаданные ${name} после потери источника`, async () => {
      let readable = true;
      const source = new File([new Uint8Array([0, 19, 73, 241, 255])], name, {
        type,
        lastModified: 12345
      });
      const slice = source.slice.bind(source);
      source.slice = (...args) => {
        if (!readable) throw new Error('Временный файл удалён');
        return slice(...args);
      };
      const copy = await snapshotFile(source);
      readable = false;
      expect(copy.name).toBe(name);
      expect(copy.type).toBe(type);
      expect(copy.lastModified).toBe(12345);
      expect([...new Uint8Array(await copy.arrayBuffer())]).toEqual([
        0, 19, 73, 241, 255
      ]);
    });
  }

  it('читает большое видео ограниченными порциями без потери границ', async () => {
    const bytes = new Uint8Array(9 * 1024 * 1024 + 3);
    bytes[0] = 17;
    bytes[4 * 1024 * 1024] = 53;
    bytes[bytes.length - 1] = 241;
    const source = new File([bytes], 'video.mov', { type: 'video/quicktime' });
    const slice = source.slice.bind(source);
    source.slice = (start, end, type) => {
      expect(end! - start!).toBeLessThanOrEqual(4 * 1024 * 1024);
      return slice(start, end, type);
    };
    const copy = await snapshotFile(source);
    expect(new Uint8Array(await copy.arrayBuffer())).toEqual(bytes);
  });

  it('отклоняет неполное чтение вместо отправки повреждённого файла', async () => {
    const source = new File(['camera'], 'photo.jpg', { type: 'image/jpeg' });
    source.slice = () => new Blob([]);
    await expect(snapshotFile(source)).rejects.toThrow(
      'Не удалось прочитать файл'
    );
  });
});
