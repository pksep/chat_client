import { ITopic, IUser } from './interfaces';

export interface IMessageListProps {
  user?: IUser;
  contacts?: ITopic[];
  baseUrl?: string;
  contact?: ITopic | null;
  deferContentRender?: boolean;
  suppressInitialSkeleton?: boolean;
}
