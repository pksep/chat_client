import { useOpenIMRestApi } from '../services/useApi';

export type RegisterUser = {
  userID: string;
  nickname: string;
  faceURL: string;
};

interface RegisterParams {
  users: RegisterUser[];
}

export const useRegister = async (
  params: RegisterParams
): Promise<{ chatToken: string; imToken: string; userID: string }> => {
  const api = useOpenIMRestApi();
  const response = await api.post('/user/user_register', params);

  const data = await response.json();

  console.log(data);
  return data;
};
