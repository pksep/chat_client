import type { ManagerInquiry } from '../useManagerInquiries';

export interface ErpContactCandidate {
  id: number;
  initial: string;
  ban: boolean;
}

export interface PendingErpContact {
  popup: Window;
  origin: string;
  actorId: string;
  inquiry: ManagerInquiry;
  contactId?: number;
  saving: boolean;
  cleanup: ReturnType<typeof setInterval>;
}
