import { createApp, h } from 'vue';
import UserProfile from '../../src/components/UserProfile/UserProfile.vue';
import { upsertLocalUser } from '../../src/composables/useUsers';
import type { IUser } from '../../src/components/interfaces/interfaces';

export function mountUserProfileLayout() {
  const root = document.createElement('header');
  root.className = 'chat__header-main';
  document.body.prepend(root);
  const user = { id: 'profile-layout-peer', initials: 'Сотрудник' } as IUser;
  createApp({
    render: () => h(UserProfile, { class: 'chat__header-profile', user })
  }).mount(root);
  return {
    setLastOnline(lastOnline: string | null) {
      upsertLocalUser({
        ...user,
        lastOnline: lastOnline === null ? null : new Date(lastOnline)
      });
    }
  };
}
