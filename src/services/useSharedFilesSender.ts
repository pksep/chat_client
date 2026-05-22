import { computed, reactive, ref } from 'vue';
import { getAuthUser } from '../composables/useAuth';
import { RouteTypes } from '../composables/navigation/useUrlRouting';
import { useMessageSender } from '../components/Messages/composables/useMessageSender';

const shareRoute = ref({
  id: '',
  type: RouteTypes.DEFAULT
});
const shareInputText = ref('');
const shareState = reactive({
  aiMessages: [],
  editMessage: null,
  replyMessage: null,
  forwardMessages: [],
  hideUnreadMarker: false
});
const shareAuthUser = computed(() => getAuthUser());
const shareMastraResult = ref(null);
const noop = () => {};

const { handleAttachSharedFiles } = useMessageSender(
  shareRoute,
  shareInputText,
  shareState as any,
  shareAuthUser as any,
  shareMastraResult as any,
  noop,
  noop
);

export const sendSharedFilesToTopic = async (
  topicId: string,
  files: File[],
  text?: string | null
): Promise<void> => {
  if (!topicId) {
    throw new Error('Target topic is required');
  }

  if (!shareAuthUser.value?.id) {
    throw new Error('User is not authorized');
  }

  await handleAttachSharedFiles(files, text, topicId);
};
