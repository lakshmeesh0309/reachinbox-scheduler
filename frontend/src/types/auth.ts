export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
}

export interface SlackStatus {
  connected: boolean;
  teamName: string | null;
  teamId: string | null;
  connectedAt: string | null;
}
