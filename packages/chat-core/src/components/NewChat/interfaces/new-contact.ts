import type { IUserProps } from '../../interfaces/interfaces';

export interface INewContactProps {
  open: boolean;
  contacts: IUserProps[];
  user?: IUserProps;
}
