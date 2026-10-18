export type PromptHistoryItem = {
  id: string;
  createdAt: string;
  original: string;
  optimized: string;
  profile?: string;
  apiStyle?: string;
};

export type HistoryMemento = {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
};

const HISTORY_KEY = "promptOptimizer.history";
const MAX_ITEMS = 40;

export class PromptHistory {
  constructor(private readonly memento: HistoryMemento) {}

  list(): PromptHistoryItem[] {
    return this.memento.get<PromptHistoryItem[]>(HISTORY_KEY, []) ?? [];
  }

  get(id: string): PromptHistoryItem | undefined {
    return this.list().find((item) => item.id === id);
  }

  async add(item: Omit<PromptHistoryItem, "id" | "createdAt">): Promise<PromptHistoryItem> {
    const entry: PromptHistoryItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    await this.memento.update(HISTORY_KEY, [entry, ...this.list()].slice(0, MAX_ITEMS));
    return entry;
  }

  async remove(id: string): Promise<void> {
    await this.memento.update(
      HISTORY_KEY,
      this.list().filter((item) => item.id !== id),
    );
  }

  async clear(): Promise<void> {
    await this.memento.update(HISTORY_KEY, []);
  }
}

export function historyPreview(item: PromptHistoryItem): {
  id: string;
  createdAt: string;
  originalPreview: string;
  optimizedPreview: string;
  profile?: string;
} {
  return {
    id: item.id,
    createdAt: item.createdAt,
    originalPreview: clip(item.original),
    optimizedPreview: clip(item.optimized),
    profile: item.profile,
  };
}

function clip(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 72 ? `${compact.slice(0, 72)}…` : compact;
}
