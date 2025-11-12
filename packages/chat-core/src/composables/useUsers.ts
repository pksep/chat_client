import { ref } from 'vue';
import { getAuthToken } from './useLogin';
import { useOpenIMRestApi } from '../services/useApi';

export interface User {
  userID: string;
  nickname: string;
  faceURL?: string;
}

export const useUsers = () => {
  const users = ref<User[]>([]);
  const loading = ref(false);
  const error = ref('');

  const fetchAllUsers = async (opts?: {
    pageNumber?: number;
    showNumber?: number;
  }): Promise<User[]> => {
    loading.value = true;
    error.value = '';

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('No authentication token found in cookies');
      }

      const api = useOpenIMRestApi();
      const body = {
        pagination: {
          pageNumber: opts?.pageNumber ?? 1,
          showNumber: opts?.showNumber ?? 100
        }
      };

      const response = await api.post(`/user/get_users`, body);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      users.value = result.data?.users ?? [];

      return users.value;
    } catch (err) {
      error.value = (err as Error).message;
      console.error('Failed to fetch users:', error.value);
      return [];
    } finally {
      loading.value = false;
    }
  };

  return {
    users,
    loading,
    error,
    fetchAllUsers
  };
};
