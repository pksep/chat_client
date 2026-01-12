export interface AuthResponse {
  UserID: string;
  token: string;
  expireTimeSeconds: number;
  PlatformID: number;
}
