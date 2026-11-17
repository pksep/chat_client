import { onMounted, onUnmounted, watch } from 'vue';
import type { IMessage } from '../components/interfaces/interfaces';
import { getMessageIdDiagnostic } from '../utils/message-range-diagnostic';
import { createTelemetryTraceId } from './useTelemetry';
import { recordMessageTelemetry } from './message-telemetry';

export const useMessageViewportTelemetry = (options: {
  getTopicId: () => string;
  getMessages: () => IMessage[];
  getLatestMessageId: () => string | undefined;
  getSnapshot: () => Record<string, unknown>;
  getVisibleMessageIds: () => string[];
}) => {
  let topicId = '';
  let viewId = '';
  let openedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSnapshot: Record<string, unknown> = {};
  let lastSignature = '';
  let lastDecisionSignature = '';
  let lastDecisionAt = 0;
  let latestKnownMessageSeen = false;
  let observedLatestMessageId: string | undefined;
  let lastVisible: ReturnType<typeof getMessageIdDiagnostic> | null = null;

  const capture = (): Record<string, unknown> => {
    const visibleIds = options.getVisibleMessageIds();
    const latestMessageId = options.getLatestMessageId();
    if (latestMessageId !== observedLatestMessageId) {
      latestKnownMessageSeen = false;
      observedLatestMessageId = latestMessageId;
    }
    latestKnownMessageSeen ||=
      !!latestMessageId && visibleIds.includes(latestMessageId);
    if (visibleIds.length) lastVisible = getMessageIdDiagnostic(visibleIds);
    lastSnapshot = {
      ...options.getSnapshot(),
      visible: getMessageIdDiagnostic(visibleIds),
      lastVisible,
      latestKnownMessageSeen
    };
    return lastSnapshot;
  };

  const record = (
    stage: string,
    payload: Record<string, unknown>,
    warning = false
  ) => {
    if (!topicId) return;
    recordMessageTelemetry({
      name: `chat.message_view.${stage}`,
      level: warning ? 'warn' : 'info',
      traceId: viewId,
      entityType: 'topic',
      entityId: topicId,
      payload: { topicId, viewId, elapsedMs: Date.now() - openedAt, ...payload }
    });
  };

  const snapshot = (reason: string) => {
    if (!topicId || topicId !== options.getTopicId()) return;
    const payload = capture();
    const signature = JSON.stringify(payload);
    if (signature === lastSignature && reason === 'changed') return;
    lastSignature = signature;
    record(
      reason === 'background' || reason === 'pagehide' ? 'hidden' : 'snapshot',
      { reason, ...payload }
    );
  };

  const schedule = () => {
    if (!topicId || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      snapshot('changed');
    }, 1500);
  };

  const close = (reason: string, refresh = false) => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (refresh && topicId === options.getTopicId()) capture();
    record('closed', { reason, ...lastSnapshot });
    topicId = '';
  };

  watch(
    options.getTopicId,
    nextTopicId => {
      close('topic_changed');
      if (!nextTopicId) return;
      topicId = nextTopicId;
      viewId = createTelemetryTraceId('message-view');
      openedAt = Date.now();
      lastSnapshot = {};
      lastSignature = '';
      lastDecisionSignature = '';
      lastVisible = null;
      latestKnownMessageSeen = false;
      observedLatestMessageId = undefined;
      record('opened', {});
      schedule();
    },
    { immediate: true, flush: 'sync' }
  );
  watch([options.getMessages, options.getLatestMessageId], schedule, {
    flush: 'post'
  });

  const handlePageHide = () => snapshot('pagehide');
  onMounted(() => window.addEventListener('pagehide', handlePageHide));
  onUnmounted(() => {
    close('unmounted', true);
    window.removeEventListener('pagehide', handlePageHide);
  });

  return {
    getViewId: () => viewId,
    schedule,
    snapshot,
    readDecision(
      source: string,
      messageIds: string[],
      decision: string,
      expectedViewId = viewId
    ) {
      if (
        !topicId ||
        topicId !== options.getTopicId() ||
        expectedViewId !== viewId
      )
        return;
      const payload = {
        ...capture(),
        source,
        decision,
        requested: getMessageIdDiagnostic(messageIds),
        serverConfirmed: false
      };
      const signature = JSON.stringify(payload);
      if (
        signature === lastDecisionSignature &&
        Date.now() - lastDecisionAt < 5000
      )
        return;
      lastDecisionSignature = signature;
      lastDecisionAt = Date.now();
      record('read_decision', payload, decision === 'failed');
    }
  };
};
