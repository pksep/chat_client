import { createApp, h, ref, type VNode } from 'vue';
import '@pksep/yui/styles';
import CachedAvatar from '../../src/components/UI/CachedAvatar.vue';

const source = new URLSearchParams(location.search).get('avatar') || '';
const path = ref(source);

createApp({
  setup(): () => VNode {
    return (): VNode =>
      h('section', [
        h(CachedAvatar, {
          path: path.value,
          initials: 'Посетитель ВК',
          dataTestid: 'ExternalAvatar'
        }),
        h(
          'button',
          {
            onClick: (): void => {
              path.value = source + '&broken=1';
            }
          },
          'Недоступный аватар'
        ),
        h(
          'button',
          {
            onClick: (): void => {
              path.value = source;
            }
          },
          'Восстановить аватар'
        )
      ]);
  }
}).mount('#avatar-probe');
