self.addEventListener(
  'message',
  (event: MessageEvent<{ id: number; blob: Blob }>) => {
    const { id, blob } = event.data;
    try {
      self.postMessage({ id, url: URL.createObjectURL(blob) });
    } catch {
      self.postMessage({ id, failed: true });
    }
  }
);

export {};
