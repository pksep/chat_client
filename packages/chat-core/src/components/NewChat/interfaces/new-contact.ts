import type { IUserProps } from '../../interfaces/interfaces';

export interface INewContactProps {
  open: boolean;
  dataTestid?: string;
  isAddOne?: boolean;
  contacts: IUserProps[];
  title?: string;
  user?: IUserProps;
}
