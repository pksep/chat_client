import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import DesktopTitleBar from '../../src/components/Desktop/DesktopTitleBar.vue';
import DesktopMediaPermissionDialog from '../../src/components/Desktop/DesktopMediaPermissionDialog.vue';
import DesktopScreenSharePicker from '../../src/components/Desktop/DesktopScreenSharePicker.vue';
import {
  initDesktopScreenCapture,
  prepareDesktopScreenCapture
} from '../../src/services/desktop-screen-capture';
import { installDesktopMediaPermissions } from '../../src/services/desktop-media-permissions';
import { useThemeStore } from '../../src/stores/theme';
import '../../src/assets/chat-container.css';

const host = document.createElement('div');
document.body.append(host);
const pinia = createPinia();
useThemeStore(pinia).setTheme(
  new URLSearchParams(location.search).get('theme') === 'dark'
);
const capture = async (constraints: MediaStreamConstraints) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach(track => track.stop());
    output.textContent = 'Доступ разрешён';
  } catch (error) {
    output.textContent = error instanceof Error ? error.name : String(error);
  }
};
const app = createApp({
  render: () => [
    h(DesktopTitleBar),
    h(DesktopMediaPermissionDialog),
    h(DesktopScreenSharePicker),
    h(
      'main',
      {
        'data-testid': 'DesktopShellContent',
        style:
          'box-sizing:border-box;height:var(--default-height);padding:32px;background:var(--surface-main);color:var(--text-primary)'
      },
      [
        h('h1', 'SEP Chat'),
        h('p', 'Оформление приложения и доступ к устройствам'),
        h(
          'button',
          { onClick: () => capture({ audio: true }) },
          'Проверить микрофон'
        ),
        h(
          'button',
          { onClick: () => capture({ audio: true, video: true }) },
          'Проверить видеозвонок'
        )
      ]
    )
  ]
});
const dispose = await installDesktopMediaPermissions();
await initDesktopScreenCapture();
app.use(pinia).mount(host);
const output = document.createElement('output');
output.dataset.testid = 'DesktopShellCaptureResult';
document.body.append(output);
Object.assign(window, {
  desktopShellFixture: {
    dispose,
    capture,
    app,
    ready: true,
    prepareDesktopScreenCapture
  }
});
