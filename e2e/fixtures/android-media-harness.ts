import { createApp, h, nextTick, ref } from 'vue';
import { SliderModal } from '@pksep/yui';
import '@pksep/yui/styles';
import { registerNativeFileBridge } from '../../src/services/native-file-bridge';
import { refreshNativeFileDownloadStatus } from '../../src/services/useNativeFile';
import { createLiveSliderItem } from '../../src/utils/live-slider-item';

export const checkFileStatus = refreshNativeFileDownloadStatus;

export async function mountLiveVideo(path: string) {
  const source = ref(path);
  const unmount = await mount([
    createLiveSliderItem(() => ({
      path: source.value,
      downloadPath: source.value,
      name: 'clip.WEBM'
    }))
  ]);
  return {
    setPath: (path: string) => {
      source.value = path;
    },
    unmount
  };
}

export async function mount(
  items: { path: string; downloadPath: string; name: string }[]
) {
  registerNativeFileBridge();
  const root = document.createElement('div');
  document.body.append(root);
  const open = ref(false);
  const app = createApp({
    render: () =>
      h(SliderModal, {
        open: open.value,
        items,
        defaultIndex: 0,
        dataTestid: 'AndroidMediaRegression'
      })
  });
  app.mount(root);
  await nextTick();
  open.value = true;
  await nextTick();
  return () => {
    app.unmount();
    root.remove();
  };
}

export async function recordVideo(): Promise<number[]> {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const context = canvas.getContext('2d')!;
  const stream = canvas.captureStream(15);
  const recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp8'
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = event => chunks.push(event.data);
  const stopped = new Promise<void>(resolve => {
    recorder.onstop = () => resolve();
  });
  recorder.start();
  for (let index = 0; index < 15; index++) {
    context.fillStyle = index % 2 ? 'green' : 'blue';
    context.fillRect(0, 0, 160, 90);
    await new Promise(resolve => setTimeout(resolve, 70));
  }
  recorder.stop();
  await stopped;
  stream.getTracks().forEach(track => track.stop());
  return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
}
