import { ContentEditor } from '@pksep/yui';

let messageListModule:
  | Promise<typeof import('../components/MessageList.vue')>
  | undefined;
let messageComposerRuntime: Promise<unknown> | undefined;

type AsyncVueComponent = {
  __asyncLoader?: () => Promise<unknown>;
};

export const loadMessageList = () =>
  (messageListModule ??= import('../components/MessageList.vue').catch(
    error => {
      messageListModule = undefined;
      throw error;
    }
  ));

export const loadMessageComposerRuntime = (): Promise<unknown> => {
  if (messageComposerRuntime) return messageComposerRuntime;

  const loader = (ContentEditor as unknown as AsyncVueComponent).__asyncLoader;
  messageComposerRuntime = loader
    ? loader().catch(error => {
        messageComposerRuntime = undefined;
        throw error;
      })
    : Promise.resolve();

  return messageComposerRuntime;
};

export const prepareMessageExperience = (): Promise<unknown[]> =>
  Promise.all([loadMessageList(), loadMessageComposerRuntime()]);

export const prepareMessageListAfterPaint = (): void => {
  const prepare = () => {
    void loadMessageList().catch(() => undefined);
  };
  requestAnimationFrame(prepare);
};
