export const saveUserIdToSession = (userId: string): void => {
  sessionStorage.setItem('userId', userId);
};

export const hasUserIdInSession = (id: string): boolean => {
  const userId = sessionStorage.getItem('userId');
  return userId === id;
};
