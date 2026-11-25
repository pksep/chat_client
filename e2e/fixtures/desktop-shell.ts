import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import DesktopTitleBar from '../../src/components/Desktop/DesktopTitleBar.vue';
import DesktopMediaPermissionDialog from '../../src/components/Desktop/DesktopMediaPermissionDialog.vue';
import DesktopPermissionPreferences from '../../src/components/Desktop/DesktopPermissionPreferences.vue';
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
        h(DesktopPermissionPreferences),
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
const showCall = new URLSearchParams(location.search).has('call');
if (showCall) {
  const { default: CallModal } = await import(
    '../../src/components/CallModal/CallModal.vue'
  );
  const call = await import('../../src/services/useCallState');
  // Playwright WebKit на Windows не содержит MediaStream; здесь проверяется геометрия.
  if (typeof MediaStream === 'undefined') {
    const assigned = new WeakMap<HTMLMediaElement, MediaStream>();
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      get() {
        return assigned.get(this) ?? null;
      },
      set(value: MediaStream) {
        assigned.set(this, value);
      }
    });
  }
  const stream =
    typeof MediaStream === 'undefined'
      ? ({
          getTracks: () => [],
          getVideoTracks: () => [],
          getAudioTracks: () => []
        } as unknown as MediaStream)
      : new MediaStream();
  call.user.value = { id: 'layout-peer', initials: 'Проверка звонка' } as any;
  call.roomId.value = 'layout-only-no-network';
  call.remoteParticipants.value = [
    {
      identity: 'layout-peer',
      name: 'Проверка звонка',
      videoStream: stream,
      cameraStream: stream,
      screenShareStream: null,
      audioStream: null,
      isVideoActive: true,
      isScreenShareActive: false,
      isHandRaised: false,
      activeReaction: null,
      activeReactionExpiresAt: null,
      isSpeaking: false,
      audioLevel: 0,
      isMicActive: false,
      connectionQuality: 'excellent'
    }
  ];
  call.open.value = true;
  call.isModalVisible.value = true;
  const callHost = document.createElement('div');
  document.body.append(callHost);
  createApp(CallModal).use(pinia).mount(callHost);
}
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
