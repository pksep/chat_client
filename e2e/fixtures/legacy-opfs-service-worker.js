const legacyDirectory = {
  getDirectoryHandle: async () => legacyDirectory,
  getFileHandle: async () => ({}),
  removeEntry: async () => {}
};
Object.defineProperty(navigator, 'storage', {
  value: { getDirectory: async () => legacyDirectory }
});
importScripts('/pending-upload-service-worker.js');
