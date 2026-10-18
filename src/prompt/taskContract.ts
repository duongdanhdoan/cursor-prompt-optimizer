export const CONTRACT_SECTION_IDS = [
  "context",
  "objective",
  "steps",
  "output",
  "constraints",
] as const;

export type ContractSectionId = (typeof CONTRACT_SECTION_IDS)[number];

export const CONTRACT_HEADINGS: Record<ContractSectionId, string> = {
  context: "1. Context",
  objective: "2. Objective",
  steps: "3. Steps",
  output: "4. Output",
  constraints: "5. Constraints and Rules",
};

export type TaskContract = Record<ContractSectionId, string>;

export type ParsedTaskContract = {
  contract: TaskContract;
  missing: ContractSectionId[];
  empty: ContractSectionId[];
  extraHeadings: string[];
  ordered: boolean;
};

const SECTION_ALIASES: Record<string, ContractSectionId> = {
  context: "context",
  "relevant context": "context",
  objective: "objective",
  goal: "objective",
  steps: "steps",
  plan: "steps",
  output: "output",
  deliverables: "output",
  constraints: "constraints",
  "constraints and rules": "constraints",
  rules: "constraints",
};

export function emptyTaskContract(): TaskContract {
  return {
    context: "",
    objective: "",
    steps: "",
    output: "",
    constraints: "",
  };
}

export function serializeTaskContract(contract: TaskContract): string {
  return CONTRACT_SECTION_IDS.map((id) => {
    const body = contract[id].trim();
    return body ? `## ${CONTRACT_HEADINGS[id]}\n\n${body}` : `## ${CONTRACT_HEADINGS[id]}`;
  }).join("\n\n");
}

export function parseTaskContract(markdown: string): ParsedTaskContract | undefined {
  const lines = markdown.replace(/\r\n/g, "\n").trim().split("\n");
  if (lines.length === 0 || (lines.length === 1 && !lines[0])) {
    return undefined;
  }

  const contract = emptyTaskContract();
  const extraHeadings: string[] = [];
  const foundOrder: ContractSectionId[] = [];
  let current: ContractSectionId | undefined;
  let sawHeading = false;
  const buffers: Record<ContractSectionId, string[]> = {
    context: [],
    objective: [],
    steps: [],
    output: [],
    constraints: [],
  };

  for (const line of lines) {
    const heading = matchContractHeading(line);
    if (heading) {
      sawHeading = true;
      if (heading.id) {
        if (!foundOrder.includes(heading.id)) {
          foundOrder.push(heading.id);
        }
        current = heading.id;
      } else {
        extraHeadings.push(heading.title);
        current = undefined;
      }
      continue;
    }
    if (current) {
      buffers[current].push(line);
    }
  }

  if (!sawHeading) {
    return undefined;
  }

  for (const id of CONTRACT_SECTION_IDS) {
    contract[id] = buffers[id].join("\n").trim();
  }

  const missing = CONTRACT_SECTION_IDS.filter((id) => !foundOrder.includes(id));
  const empty = CONTRACT_SECTION_IDS.filter((id) => foundOrder.includes(id) && !contract[id]);
  const ordered = isSectionOrder(foundOrder);

  return { contract, missing, empty, extraHeadings, ordered };
}

export function matchContractHeading(
  line: string,
): { id?: ContractSectionId; title: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }

  const markdown = trimmed.match(/^#{1,6}\s+(?:(?:\d+)[\.)]\s*)?(.+?)\s*$/);
  if (markdown) {
    const title = (markdown[1] ?? "").trim();
    return { id: SECTION_ALIASES[normalizeHeading(title)], title };
  }

  const numbered = trimmed.match(/^\d+[\.)]\s+(.+?)\s*$/);
  if (numbered) {
    const title = (numbered[1] ?? "").trim();
    const id = SECTION_ALIASES[normalizeHeading(title)];
    return id ? { id, title } : undefined;
  }

  const id = SECTION_ALIASES[normalizeHeading(trimmed)];
  if (id && trimmed.length <= 48) {
    return { id, title: trimmed };
  }
  return undefined;
}

function normalizeHeading(title: string): string {
  return title
    .toLowerCase()
    .replace(/[*_`]/g, "")
    .replace(/[:.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSectionOrder(found: ContractSectionId[]): boolean {
  let last = -1;
  for (const id of found) {
    const index = CONTRACT_SECTION_IDS.indexOf(id);
    if (index < last) {
      return false;
    }
    last = index;
  }
  return found.length > 0;
}
