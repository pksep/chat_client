import { ITopic, IUser } from './interfaces';

export interface IMessageListProps {
  user?: IUser;
  contacts?: ITopic[];
  baseUrl?: string;
  contact?: ITopic | null;
  showUpdateBanner?: boolean;
  updateActionLabel?: string;
  isUpdateActionDisabled?: boolean;
  onUpdateClick?: () => void | Promise<void>;
  onDismissUpdateBanner?: () => void;
}
