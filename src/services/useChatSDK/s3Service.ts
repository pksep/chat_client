import { Reqi } from '@pksep/reqi';

export interface S3Config {
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
}

export interface UploadResult {
  id: string;
  path: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export class S3Service {
  private reqi: Reqi;

  constructor(reqi: Reqi) {
    this.reqi = reqi;
  }

  async uploadFile(file: File): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await this.reqi.post('/media/upload', formData);

      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`Failed to upload: ${(error as Error).message}`);
    }
  }
}
