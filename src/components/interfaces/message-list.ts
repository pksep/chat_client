import { ITopic, IUser } from './interfaces';

export interface IMessageListProps {
  user?: IUser;
  contacts?: ITopic[];
  baseUrl?: string;
  contact?: ITopic | null;
  showUpdateBanner?: boolean;
  updateActionLabel?: string;
  updateProgress?: number | null;
  isUpdateActionDisabled?: boolean;
  onUpdateClick?: () => void | Promise<void>;
  onDismissUpdateBanner?: () => void;
}
