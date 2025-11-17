export interface IMessageBubbleProps {
  message: string;
  author?: string;
  time: string;
  loader?: boolean;
  isMeSender?: boolean;
  sender?: string;
  avatar?: string;
}
