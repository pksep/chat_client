import { ITopic, IUser } from './interfaces';

export interface IMessageListProps {
  user?: IUser;
  contacts?: ITopic[];
  baseUrl?: string;
  chapter?: string | null;
  contact?: ITopic | null;
}
