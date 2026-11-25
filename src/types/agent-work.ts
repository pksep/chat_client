export type AgentWorkEntry =
  | { id: string; kind: 'summary' | 'commentary'; text: string }
  | {
      id: string;
      kind: 'action';
      text: string;
      state: 'running' | 'done' | 'failed' | 'interrupted';
    };
