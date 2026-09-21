import { strict as assert } from 'node:assert';
import {
  mergeRefreshedAiAttachments,
  parseAiAttachmentReferences,
  parseAiMessageAttachments
} from '../src/services/aiAttachmentReferences';

const now = Date.now();
const files = Array.from({ length: 7 }, (_, index) => ({
  attachmentId: crypto.randomUUID(),
  contentHash: String(index).repeat(64),
  name: `${index}.txt`,
  size: 5,
  contentType: 'text/plain',
  transferToken: 'old-'.repeat(20),
  expiresAt: now - 1000
}));
const refreshed = files.map(file => ({
  ...file,
  transferToken: 'new-'.repeat(20),
  expiresAt: now + 600_000
}));
const stored = files.map(({ transferToken: _token, expiresAt: _expiry, ...file }) => file);
assert.deepEqual(parseAiMessageAttachments(stored), stored);
assert.deepEqual(mergeRefreshedAiAttachments(stored, refreshed, now), refreshed);
assert.throws(() => parseAiAttachmentReferences(stored), /проверить сохранённые/);
assert.throws(() => parseAiMessageAttachments([{ ...stored[0], contentHash: undefined }]), /проверить сохранённые/);
assert.deepEqual(mergeRefreshedAiAttachments([stored[0], files[1]], refreshed.slice(0, 2), now), refreshed.slice(0, 2));
assert.deepEqual(parseAiAttachmentReferences(files), files);
assert.deepEqual(mergeRefreshedAiAttachments(files, refreshed, now), refreshed);
assert.throws(
  () => mergeRefreshedAiAttachments(files, refreshed.slice(1), now),
  /всем вложениям/
);
assert.throws(
  () => mergeRefreshedAiAttachments(files, refreshed.toReversed(), now),
  /всем вложениям/
);
for (const patch of [
  { contentHash: 'f'.repeat(64) },
  { name: 'changed.txt' },
  { size: 6 },
  { contentType: 'image/png' },
  { expiresAt: now - 100 }
]) {
  assert.throws(
    () =>
      mergeRefreshedAiAttachments(
        files,
        refreshed.map((file, index) =>
          index === 4 ? { ...file, ...patch } : file
        ),
        now
      ),
    /неизменность/
  );
}
const legacy = {
  name: 'old.txt',
  size: 5,
  contentType: 'text/plain',
  transferToken: 'old-'.repeat(20),
  expiresAt: now + 1000
};
assert.deepEqual(
  mergeRefreshedAiAttachments([legacy, ...files], refreshed, now),
  [legacy, ...refreshed]
);
assert.throws(
  () =>
    mergeRefreshedAiAttachments(
      [{ ...legacy, expiresAt: now - 1 }, ...files],
      refreshed,
      now
    ),
  /старому вложению/
);
assert.throws(
  () =>
    parseAiAttachmentReferences([
      ...files,
      { ...files[0], contentHash: undefined }
    ]),
  /проверить сохранённые/
);
assert.deepEqual(
  mergeRefreshedAiAttachments([files[0], files[0]], [refreshed[0]], now),
  [refreshed[0], refreshed[0]]
);
assert.equal(files[4].transferToken, 'old-'.repeat(20));
console.log(
  'Проверки сохранности семи вложений, обновления ссылок, старого формата и запрета подмены прошли.'
);
