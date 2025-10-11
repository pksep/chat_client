export interface IMessageBubbleProps {
  message: string;
  time: string;
  loader?: boolean;
  author?: 'assistant' | 'user';
}
