import { IContactProps, IUserProps } from './interfaces';

export interface IMessageListProps {
  user?: IUserProps;
  contacts?: IContactProps[];
  baseUrl?: string;
  chapter?: string | null;
  contactId?: string;
  conversionId?: string;
}
