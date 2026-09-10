import { ref } from 'vue';
import type { IUserStatus } from '../interfaces/interfaces';

// Временный предпросмотр до подтверждения дизайна; серверные данные не меняет.
export const isStatusPresetDesignPreview =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('designPreview') ===
    'status-presets';

export const statusPresetDesignPreview = ref<IUserStatus[]>([
  { icon: '💻', text: 'Работаю удалённо' },
  { icon: '📅', text: 'На встрече' }
]);
