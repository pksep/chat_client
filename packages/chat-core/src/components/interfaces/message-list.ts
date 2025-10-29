import { IUserProps } from './interfaces';

export interface IMessageListProps {
  user: IUserProps;
  baseUrl?: string;
  chapter?: string | null;
}
