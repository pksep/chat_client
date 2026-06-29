import { uploadFile } from '../services/useChat';

export const uploadAvatarToMinio = async (file: File): Promise<string> => {
  const uploaded = await uploadFile(file);
  return uploaded.path;
};
