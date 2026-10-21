export const getAccessTokenFromResponse = (
  data: Record<string, unknown>
): string => {
  // В раздельной авторизации erpToken предназначен для ERP, а не для API Чата.
  for (const key of ['accessToken', 'token', 'erpToken']) {
    const candidate = data[key];

    if (typeof candidate === 'string' && candidate) {
      return candidate;
    }
  }

  return '';
};
