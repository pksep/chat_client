import type { IMessage } from '../components/interfaces/interfaces';

export interface PinnedMessageComposerAction {
  kind: 'edit' | 'reply';
  message: IMessage;
  quoteText?: string;
  quoteOccurrenceIndex?: number;
}
