export interface IMessageBubbleProps {
  message: string;
  time: string;
  loader?: boolean;
  author?: 'assistant' | 'user';
}

export interface IPersonalMessageBubbleProps {
  message: string;
  time: number;
  isMeSender: boolean;
}
