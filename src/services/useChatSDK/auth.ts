import { User } from '@pksep/zod-shared-chat';
import { Reqi } from '@pksep/reqi';

export interface ChatAuthInterface {
  authenticateUser(credentials: {
    email: string;
    password: string;
  }): Promise<{ user: User; token: string }>;
}

export class ChatAuth implements ChatAuthInterface {
  private reqi: Reqi;
  private token?: string;

  constructor(apiUrl: string, token?: string) {
    this.token = token;
    this.reqi = new Reqi(apiUrl, {
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    });
  }

  async authenticateUser(credentials: {
    email: string;
    password: string;
  }): Promise<{ user: User; token: string }> {
    try {
      const response = (await this.reqi.post('/auth/login', credentials, {
        parsed: false
      })) as any;
      const result = await response.json();

      this.token = result.token;

      return result;
    } catch (error) {
      throw new Error(`Authentication failed: ${(error as Error).message}`);
    }
  }
}
