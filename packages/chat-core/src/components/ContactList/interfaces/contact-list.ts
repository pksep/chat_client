interface IContact {
  id: string;
  title: string;
  imageURL: string;
  isPin?: boolean;
  latestMessage: string;
  latestMessageTime: Date;
  notificationCount: number;
  isRead?: boolean;
}

export interface IContactListProps {
  contacts: IContact[];
}
