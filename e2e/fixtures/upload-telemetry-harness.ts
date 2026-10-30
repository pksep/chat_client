export { ChatSDK } from '../../src/services/useChatSDK';
export { setConfig } from '../../src/services/useConfig';
export * as telemetry from '../../src/services/useTelemetry';
export { recordActiveUploadSnapshots } from '../../src/services/upload-request-telemetry';

export const installControlledUploadXHR = () => {
  const state = {
    xhr: null as ControlledUploadXHR | null,
    aborts: 0,
    throwOnSend: false
  };
  class ControlledUploadXHR extends EventTarget {
    static HEADERS_RECEIVED = 2;
    upload = new EventTarget();
    readyState = 0;
    status = 0;
    timeout = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    open() {
      this.readyState = 1;
    }
    setRequestHeader() {
      return undefined;
    }
    send() {
      state.xhr = this;
      if (state.throwOnSend) throw new Error('Сбой запуска тестового PUT');
    }
    progress(loaded: number) {
      const event = new ProgressEvent('progress', {
        loaded,
        total: 100,
        lengthComputable: true
      });
      (this.upload as any).onprogress?.(event);
      this.upload.dispatchEvent(event);
    }
    bodySent() {
      this.upload.dispatchEvent(new ProgressEvent('load'));
    }
    complete(status: number) {
      this.status = status;
      this.readyState = 2;
      this.dispatchEvent(new Event('readystatechange'));
      this.readyState = 4;
      this.onload?.();
      this.dispatchEvent(new ProgressEvent('load'));
      this.dispatchEvent(new ProgressEvent('loadend'));
    }
    abort() {
      state.aborts++;
      this.onabort?.();
      this.dispatchEvent(new ProgressEvent('abort'));
      this.dispatchEvent(new ProgressEvent('loadend'));
    }
  }
  window.XMLHttpRequest = ControlledUploadXHR as any;
  return state;
};
