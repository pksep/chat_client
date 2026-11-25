import { watch } from 'vue';
import { getAuthUser } from '../composables/useAuth';
import {
  handRaisedParticipants,
  open,
  participantReactions,
  remoteParticipants,
  roomId,
  topicId,
  type CallReaction
} from './useCallState';
import { showTauriCallActivityNotification } from './useTauriNotifications';

export interface DesktopCallActivity {
  roomId: string;
  topicId: string | null;
  participantId: string;
  participantName: string;
  kind: 'hand' | 'reaction';
  reaction?: CallReaction;
}

export function installDesktopCallActivityNotifications(options: {
  isActive: () => Promise<boolean>;
  notify?: (activity: DesktopCallActivity) => Promise<boolean>;
}) {
  let disposed = false;
  const notify = (
    participantId: string,
    kind: DesktopCallActivity['kind'],
    reaction?: CallReaction
  ) => {
    const currentRoomId = roomId.value;
    if (!open.value || !currentRoomId || participantId === getAuthUser()?.id)
      return;
    const activity: DesktopCallActivity = {
      roomId: currentRoomId,
      topicId: topicId.value,
      participantId,
      participantName:
        remoteParticipants.value.find(
          participant => participant.identity === participantId
        )?.name || 'Участник звонка',
      kind,
      reaction
    };
    void (async () => {
      if (await options.isActive()) return;
      if (disposed || !open.value || roomId.value !== currentRoomId) return;
      await (options.notify || showTauriCallActivityNotification)(activity);
    })().catch(error =>
      console.warn('Не удалось показать событие звонка:', error)
    );
  };
  const stopHands = watch(
    handRaisedParticipants,
    (current, previous) => {
      for (const [participantId, raised] of Object.entries(current)) {
        if (raised && !previous[participantId]) notify(participantId, 'hand');
      }
    },
    { flush: 'sync' }
  );
  const stopReactions = watch(participantReactions, (current, previous) => {
    for (const [participantId, entry] of Object.entries(current)) {
      const old = previous[participantId];
      if (
        entry.expiresAt <= Date.now() ||
        (old?.reaction === entry.reaction && old.expiresAt === entry.expiresAt)
      )
        continue;
      notify(participantId, 'reaction', entry.reaction);
    }
  });
  return () => {
    disposed = true;
    stopHands();
    stopReactions();
  };
}
