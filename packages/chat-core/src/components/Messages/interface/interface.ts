export interface IMessageBubbleProps {
  message: string;
  loader?: boolean;
  author?: 'assistant' | 'user';
  time: string;
  isMeSender: boolean;
  sender: string;
  avatar: string;
}
