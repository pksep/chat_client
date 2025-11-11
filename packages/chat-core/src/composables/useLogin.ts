import { useOpenIMRestApi } from './useApi';

interface RegisterParams {
  user: {
    userID: string;
    nickname: string;
    faceURL: string;
  };
}

export const useRegister = async (
  params: RegisterParams
): Promise<{ chatToken: string; imToken: string; userID: string }> => {
  const api = useOpenIMRestApi();
  const response = await api.post('/user/user_register', {
    users: [{ ...params }]
  });

  const data = await response.json();

  console.log(data);
  return data;
};
