export type MemoryHit = {
  id: string;
  content: string;
  source?: string;
  score?: number;
  updatedAt?: string;
  symbols?: string[];
};

export type MemorySearchInput = {
  query: string;
  projectRoot: string;
  limit: number;
  filters?: Record<string, string>;
};

export interface ExistingMemoryAdapter {
  search(input: MemorySearchInput): Promise<MemoryHit[]>;
}

export type MemorySearchDetails = {
  hits: MemoryHit[];
  requestCount: number;
  projectName?: string;
  unavailableReason?: string;
};

export class MemoryUnavailableError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "MemoryUnavailableError";
    this.reason = reason;
  }
}
