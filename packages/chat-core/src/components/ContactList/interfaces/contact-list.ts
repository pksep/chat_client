interface IContact {
  id: string;
  title: string;
  imageURL: string;
  isPin?: boolean;
  latestMessage: string;
  notificationCount: number;
}

export interface IContactListProps {
  contacts: IContact[];
}
