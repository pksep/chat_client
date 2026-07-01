import {
  currentRoute,
  RouteTypes,
  type RouteType
} from '../composables/navigation/useUrlRouting';
import { createTelemetryTraceId, recordTelemetryEvent } from './useTelemetry';

type ChatRouteSnapshot = {
  type: RouteType | null;
  id: string | null;
  href?: string;
  pathname?: string;
};

type TopicRouteType = typeof RouteTypes.DIALOGS | typeof RouteTypes.GROUP;

export type ChatTopicOpenTelemetryMeta = {
  traceId: string;
  expectedTopicId: string;
  expectedRouteType: TopicRouteType;
  source: string;
};

type TopicListSnapshot = {
  clickedIndex?: number;
  clickedTopicIdAtIndex?: string;
  visibleTopicCount?: number;
  visibleTopicIdsAroundClick?: string[];
  visibleTopicIdsFirst?: string[];
  visibleTopicIdsLast?: string[];
};

type InteractionSnapshot = {
  eventType?: string;
  trigger?: string;
  pointerType?: string;
  button?: number;
  detail?: number;
  key?: string;
  clientX?: number;
  clientY?: number;
  targetTag?: string;
  currentTargetTag?: string;
  targetRole?: string | null;
  currentTargetRole?: string | null;
  targetTestId?: string | null;
  currentTargetTestId?: string | null;
};

type PendingTopicOpen = ChatTopicOpenTelemetryMeta & {
  startedAtMs: number;
  routeBefore: ChatRouteSnapshot;
  topicType?: string;
  navigationRequests: Array<{
    source: string;
    routeBefore: ChatRouteSnapshot;
    atMs: number;
  }>;
};

const TOPIC_ID_SAMPLE_SIZE = 5;
const TOPIC_ID_AROUND_CLICK_RADIUS = 3;
const ROUTE_RESULT_DELAY_MS = 750;
const ROUTE_RESULT_LATE_DELAY_MS = 1800;
const RENDER_MISMATCH_THROTTLE_MS = 5000;

const pendingTopicOpens = new Map<string, PendingTopicOpen>();
let lastRenderMismatchKey = '';
let lastRenderMismatchAtMs = 0;

const getRouteSnapshot = (): ChatRouteSnapshot => {
  const route = currentRoute.value;

  if (typeof window === 'undefined') {
    return {
      type: route?.type || null,
      id: route?.id || null
    };
  }

  return {
    type: route?.type || null,
    id: route?.id || null,
    href: window.location.href,
    pathname: window.location.pathname
  };
};

const getExpectedRouteType = (topicType?: string): TopicRouteType | null => {
  if (topicType === 'DM') {
    return RouteTypes.DIALOGS;
  }

  if (topicType === 'GROUP') {
    return RouteTypes.GROUP;
  }

  return null;
};

const getTopicListSnapshot = (
  topicIds: string[] | undefined,
  clickedIndex?: number
): TopicListSnapshot => {
  if (!topicIds?.length) {
    return {
      clickedIndex
    };
  }

  const safeIndex =
    typeof clickedIndex === 'number' && clickedIndex >= 0
      ? clickedIndex
      : topicIds.findIndex(Boolean);
  const aroundStart = Math.max(0, safeIndex - TOPIC_ID_AROUND_CLICK_RADIUS);
  const aroundEnd = Math.min(
    topicIds.length,
    safeIndex + TOPIC_ID_AROUND_CLICK_RADIUS + 1
  );

  return {
    clickedIndex,
    clickedTopicIdAtIndex: safeIndex >= 0 ? topicIds[safeIndex] : undefined,
    visibleTopicCount: topicIds.length,
    visibleTopicIdsAroundClick:
      safeIndex >= 0 ? topicIds.slice(aroundStart, aroundEnd) : [],
    visibleTopicIdsFirst: topicIds.slice(0, TOPIC_ID_SAMPLE_SIZE),
    visibleTopicIdsLast: topicIds.slice(-TOPIC_ID_SAMPLE_SIZE)
  };
};

const getElementSnapshot = (element: EventTarget | null) => {
  if (!(element instanceof HTMLElement)) {
    return {};
  }

  return {
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute('role'),
    testId: element.getAttribute('data-testid')
  };
};

export const getInteractionTelemetryPayload = (
  event?: Event
): InteractionSnapshot => {
  if (!event) {
    return {};
  }

  const target = getElementSnapshot(event.target);
  const currentTarget = getElementSnapshot(event.currentTarget);
  const mouseEvent = event instanceof MouseEvent ? event : null;
  const pointerEvent =
    typeof PointerEvent !== 'undefined' && event instanceof PointerEvent
      ? event
      : null;
  const keyboardEvent = event instanceof KeyboardEvent ? event : null;

  return {
    eventType: event.type,
    trigger: keyboardEvent ? 'keyboard' : 'pointer',
    pointerType:
      pointerEvent?.pointerType || (mouseEvent ? 'mouse' : undefined),
    button: mouseEvent?.button,
    detail: mouseEvent?.detail,
    key: keyboardEvent?.key,
    clientX: mouseEvent?.clientX,
    clientY: mouseEvent?.clientY,
    targetTag: target.tag,
    currentTargetTag: currentTarget.tag,
    targetRole: target.role,
    currentTargetRole: currentTarget.role,
    targetTestId: target.testId,
    currentTargetTestId: currentTarget.testId
  };
};

const recordRouteResult = (traceId: string, late: boolean): void => {
  const pending = pendingTopicOpens.get(traceId);

  if (!pending) {
    return;
  }

  const routeAfter = getRouteSnapshot();
  const matched =
    routeAfter.type === pending.expectedRouteType &&
    routeAfter.id === pending.expectedTopicId;

  recordTelemetryEvent({
    category: 'chat',
    name: matched
      ? late
        ? 'chat.topic_open.route_result_late'
        : 'chat.topic_open.route_result'
      : late
        ? 'chat.topic_open.route_mismatch_late'
        : 'chat.topic_open.route_mismatch',
    level: matched ? 'debug' : 'warn',
    traceId,
    entityType: 'topic',
    entityId: pending.expectedTopicId,
    payload: {
      source: pending.source,
      topicType: pending.topicType,
      expectedTopicId: pending.expectedTopicId,
      expectedRouteType: pending.expectedRouteType,
      actualRouteId: routeAfter.id,
      actualRouteType: routeAfter.type,
      matched,
      late,
      latencyMs: Math.round(performance.now() - pending.startedAtMs),
      routeBefore: pending.routeBefore,
      routeAfter,
      navigationRequests: pending.navigationRequests
    }
  });

  if (matched || late) {
    pendingTopicOpens.delete(traceId);
  }
};

const scheduleRouteResultChecks = (traceId: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.setTimeout(
    () => recordRouteResult(traceId, false),
    ROUTE_RESULT_DELAY_MS
  );
  window.setTimeout(
    () => recordRouteResult(traceId, true),
    ROUTE_RESULT_LATE_DELAY_MS
  );
};

export const recordChatTopicOpenAttempt = (input: {
  topicId: string;
  topicType?: string;
  source: string;
  selectedTopicId?: string | null;
  isMobile?: boolean;
  showCheckbox?: boolean;
  searchActive?: boolean;
  searchLength?: number;
  toolbarFilter?: string;
  visibleTopicIds?: string[];
  clickedIndex?: number;
  interaction?: InteractionSnapshot;
  topicFlags?: Record<string, unknown>;
}): ChatTopicOpenTelemetryMeta | null => {
  const expectedRouteType = getExpectedRouteType(input.topicType);
  const traceId = createTelemetryTraceId('chat-topic-open');
  const routeBefore = getRouteSnapshot();

  if (!expectedRouteType) {
    recordTelemetryEvent({
      category: 'chat',
      name: 'chat.topic_open.invalid_topic_type',
      level: 'warn',
      traceId,
      entityType: 'topic',
      entityId: input.topicId,
      payload: {
        source: input.source,
        topicId: input.topicId,
        topicType: input.topicType,
        routeBefore
      }
    });
    return null;
  }

  pendingTopicOpens.set(traceId, {
    traceId,
    expectedTopicId: input.topicId,
    expectedRouteType,
    source: input.source,
    startedAtMs: performance.now(),
    routeBefore,
    topicType: input.topicType,
    navigationRequests: []
  });

  recordTelemetryEvent({
    category: 'chat',
    name: 'chat.topic_open.clicked',
    level: 'info',
    traceId,
    entityType: 'topic',
    entityId: input.topicId,
    payload: {
      source: input.source,
      topicId: input.topicId,
      topicType: input.topicType,
      expectedRouteType,
      selectedTopicIdBefore: input.selectedTopicId || null,
      routeBefore,
      isMobile: input.isMobile,
      showCheckbox: input.showCheckbox,
      searchActive: input.searchActive,
      searchLength: input.searchLength,
      toolbarFilter: input.toolbarFilter,
      list: getTopicListSnapshot(input.visibleTopicIds, input.clickedIndex),
      interaction: input.interaction || {},
      topicFlags: input.topicFlags || {}
    }
  });

  scheduleRouteResultChecks(traceId);

  return {
    traceId,
    expectedTopicId: input.topicId,
    expectedRouteType,
    source: input.source
  };
};

export const recordChatTopicNavigationRequest = (input: {
  telemetry?: ChatTopicOpenTelemetryMeta | null;
  topicId: string;
  topicType?: string;
  source: string;
}): void => {
  const routeBefore = getRouteSnapshot();
  const expectedRouteType = getExpectedRouteType(input.topicType);

  if (input.telemetry?.traceId) {
    const pending = pendingTopicOpens.get(input.telemetry.traceId);
    pending?.navigationRequests.push({
      source: input.source,
      routeBefore,
      atMs: Date.now()
    });
  }

  recordTelemetryEvent({
    category: 'chat',
    name: 'chat.topic_open.navigation_requested',
    level: 'debug',
    traceId: input.telemetry?.traceId,
    entityType: 'topic',
    entityId: input.topicId,
    payload: {
      source: input.source,
      topicId: input.topicId,
      topicType: input.topicType,
      expectedRouteType,
      routeBefore
    }
  });
};

export const recordChatMessageListRenderMismatch = (input: {
  routeTopicId: string;
  routeType?: RouteType | null;
  renderedTopicId: string;
  messageCount: number;
  isLoadingInitialMessages: boolean;
  switchToken: number;
  latencyMs?: number;
}): void => {
  const now = Date.now();
  const mismatchKey = `${input.routeType}:${input.routeTopicId}:${input.renderedTopicId}`;

  if (
    mismatchKey === lastRenderMismatchKey &&
    now - lastRenderMismatchAtMs < RENDER_MISMATCH_THROTTLE_MS
  ) {
    return;
  }

  lastRenderMismatchKey = mismatchKey;
  lastRenderMismatchAtMs = now;

  recordTelemetryEvent({
    category: 'chat',
    name: 'chat.message_list.render_mismatch',
    level: 'warn',
    entityType: 'topic',
    entityId: input.routeTopicId,
    payload: {
      routeTopicId: input.routeTopicId,
      routeType: input.routeType,
      renderedTopicId: input.renderedTopicId,
      messageCount: input.messageCount,
      isLoadingInitialMessages: input.isLoadingInitialMessages,
      switchToken: input.switchToken,
      latencyMs: input.latencyMs,
      route: getRouteSnapshot()
    }
  });
};
