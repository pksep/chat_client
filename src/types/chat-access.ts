export interface ChatAccessValues {
  client: boolean;
  ai: boolean;
}

export interface ChatUserAccess {
  userId: string;
  erpUserId: number | null;
  erpRoleId: number | null;
  access: ChatAccessValues;
  effective: ChatAccessValues;
}
