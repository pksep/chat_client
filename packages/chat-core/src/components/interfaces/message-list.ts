import { IUserProps } from './interfaces';

export interface IMessageListProps {
  user?: IUserProps;
  contacts?: IUserProps[];
  baseUrl?: string;
  chapter?: string | null;
  contactId?: string;
  conversionId?: string;
}
