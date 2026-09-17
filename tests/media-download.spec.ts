import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildMediaDownloadUrl } from '../src/utils/media-download';
import {
  buildBrowserCompatibleImageUrl,
  isHeicMediaPath
} from '../src/utils/media-format';

const originalWindow = globalThis.window;

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { href: 'https://chat.example.com/topic/1' } }
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow
  });
});

describe('media browser download URL', () => {
  it('requests a server-side attachment without fetching a blob', () => {
    const result = new URL(
      buildMediaDownloadUrl(
        '/api/media/object/folder/video.mp4?token=kept',
        'Ð·Ð°Ð¿Ð¸ÑÑŒ Ð·Ð²Ð¾Ð½ÐºÐ°.mp4'
      )
    );

    assert.equal(result.origin, 'https://chat.example.com');
    assert.equal(result.pathname, '/api/media/object/folder/video.mp4');
    assert.equal(result.searchParams.get('token'), 'kept');
    assert.equal(
      result.searchParams.get('downloadName'),
      'Ð·Ð°Ð¿Ð¸ÑÑŒ Ð·Ð²Ð¾Ð½ÐºÐ°.mp4'
    );
  });

  it('keeps local object URLs unchanged', () => {
    assert.equal(
      buildMediaDownloadUrl('blob:local-media', 'video.mp4'),
      'blob:local-media'
    );
  });

  it('downloads the original even when called with an image preview URL', () => {
    const result = new URL(
      buildMediaDownloadUrl(
        '/api/media/object/photo.heic?preview=webp',
        'photo.heic'
      )
    );
    assert.equal(result.searchParams.get('preview'), null);
    assert.equal(result.searchParams.get('downloadName'), 'photo.heic');
  });

  it('does not invalidate an external signed URL', () => {
    const url = 'https://storage.example.com/video.mp4?signature=original';

    assert.equal(buildMediaDownloadUrl(url, 'video.mp4'), url);
  });
});

describe('browser-compatible image URL', () => {
  it('routes internal HEIC and HEIF images through the WebP preview', () => {
    for (const extension of ['heic', 'HEIF']) {
      const result = new URL(
        buildBrowserCompatibleImageUrl(
          `/api/media/object/folder/photo.${extension}?token=kept`
        )
      );

      assert.equal(
        result.pathname,
        `/api/media/object/folder/photo.${extension}`
      );
      assert.equal(result.searchParams.get('token'), 'kept');
      assert.equal(result.searchParams.get('preview'), 'webp');
      assert.equal(isHeicMediaPath(result.toString()), true);
    }
  });

  it('does not rewrite external HEIC URLs without the media endpoint', () => {
    const url = 'https://storage.example.com/photo.heic?signature=original';

    assert.equal(buildBrowserCompatibleImageUrl(url), url);
  });

  it('keeps browser-native image URLs unchanged', () => {
    const url = '/api/media/object/folder/photo.webp';

    assert.equal(buildBrowserCompatibleImageUrl(url), url);
    assert.equal(isHeicMediaPath(url), false);
  });
});
