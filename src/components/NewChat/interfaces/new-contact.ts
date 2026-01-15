import type { IUser } from '../../interfaces/interfaces';

export interface INewContactProps {
  open: boolean;
  dataTestid?: string;
  isAddOne?: boolean;
  contacts: IUser[];
  title?: string;
  user?: IUser;
}
