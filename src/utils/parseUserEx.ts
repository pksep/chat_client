export interface IUserExMeta {
  erpInitials?: string;
  erpRole?: string;
}

export const parseUserEx = (ex: unknown): IUserExMeta => {
  if (!ex) {
    return {};
  }

  if (typeof ex === 'string') {
    try {
      const parsed = JSON.parse(ex);

      return parsed && typeof parsed === 'object'
        ? (parsed as IUserExMeta)
        : {};
    } catch {
      return {};
    }
  }

  if (typeof ex === 'object') {
    return ex as IUserExMeta;
  }

  return {};
};
