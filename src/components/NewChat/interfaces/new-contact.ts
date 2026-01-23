import type { IUser } from '../../interfaces/interfaces';

export interface INewContactProps {
  open: boolean;
  dataTestid?: string;
  isAddOne?: boolean;
  title?: string;
  contacts?: IUser[];
  excludedContactIds?: Set<string | number>;
}
