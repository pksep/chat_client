import { uploadFile } from '../services/useChat';
import { createTelemetryTraceId } from '../services/useTelemetry';

export const uploadAvatarToMinio = async (file: File): Promise<string> => {
  const uploaded = await uploadFile(file, undefined, undefined, false, {
    traceId: createTelemetryTraceId('avatar-upload'),
    source: 'avatar'
  });
  return uploaded.path;
};
