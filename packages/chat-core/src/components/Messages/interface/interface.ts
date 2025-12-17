import { FileElem } from '@openim/wasm-client-sdk';

export interface IMessageBubbleProps {
  message: string;
  author?: string;
  time: string;
  loader?: boolean;
  isRead?: boolean;
  isMeSender?: boolean;
  sender?: string;
  avatar?: string;
  media?: {
    sourcePicture: {
      uuid: string;
      name?: string;
      size: number;
      type: string;
      url: string;
    };
  };
  file?: FileElem;
  dataTestid?: string;
}
