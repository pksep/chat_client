import { Reqi } from '@pksep/reqi';

interface RegisterParams {
  user: {
    userID: string;
    nickname: string;
    faceURL: string;
  };
}

const api = new Reqi(`https://${import.meta.env.VITE_OPENIM_API_DOMAIN}`);

api.request.use((request: Request): Request => {
  request.headers.set('operationID', crypto.randomUUID());
  request.headers.set('token', import.meta.env.VITE_OPENIM_TOKEN);
  return request;
});

export const useRegister = async (
  params: RegisterParams
): Promise<{ chatToken: string; imToken: string; userID: string }> => {
  const response = await api.post('/user/user_register', {
    users: [{ ...params }]
  });

  const data = await response.json();

  console.log(data);
  return data;
};
