import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import {
  ExistingMemoryAdapter as ExistingMemoryAdapterContract,
  MemoryHit,
  MemorySearchDetails,
  MemorySearchInput,
  MemoryUnavailableError,
} from "./MemoryAdapter";
import { reconcileMemoryHits } from "./reconcileHits";

const execFileAsync = promisify(execFile);

export type CliRunner = (cliPath: string, tool: string, args: Record<string, unknown>) => Promise<unknown>;

export type ExistingMemoryAdapterOptions = {
  cliPath: string;
  runCli?: CliRunner;
  timeoutMs?: number;
};

type IndexedProject = {
  name: string;
  root_path?: string;
  branch?: string;
};

type SearchGraphPayload = {
  semantic?: { cols?: string[]; rows?: unknown[][] };
  cols?: string[];
  rows?: unknown[][];
  groups?: Array<{ cols?: string[]; rows?: unknown[][] }>;
};

export class ExistingMemoryAdapter implements ExistingMemoryAdapterContract {
  private readonly cliPath: string;
  private readonly runCli: CliRunner;
  private readonly timeoutMs: number;

  constructor(options: ExistingMemoryAdapterOptions) {
    this.cliPath = resolveCliPath(options.cliPath);
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.runCli = options.runCli ?? createDefaultCliRunner(this.timeoutMs);
  }

  async search(input: MemorySearchInput): Promise<MemoryHit[]> {
    const details = await this.searchDetailed(input);
    if (details.unavailableReason) {
      throw new MemoryUnavailableError(details.unavailableReason);
    }
    return details.hits;
  }

  async searchDetailed(input: MemorySearchInput): Promise<MemorySearchDetails> {
    let requestCount = 0;
    try {
      requestCount += 1;
      const projects = await this.listProjects();
      const projectName = resolveProjectName(input.projectRoot, projects, input.filters?.project);
      if (!projectName) {
        return {
          hits: [],
          requestCount,
          unavailableReason: "No indexed project matches the current workspace.",
        };
      }

      const semanticQuery = buildSemanticQuery(input.query);
      const identifierQuery = buildIdentifierQuery(input);
      const pageSize = Math.min(Math.max(input.limit, 1), 50);
      requestCount += 1;
      const semanticTask = this.runCli(this.cliPath, "search_graph", {
        project: projectName,
        semantic_query: semanticQuery,
        limit: pageSize,
        semantic_limit: pageSize,
        format: "json",
        max_output_tokens: 2000,
        include_connected: false,
      }) as Promise<SearchGraphPayload>;

      let identifierHits: MemoryHit[] = [];
      if (identifierQuery) {
        requestCount += 1;
        try {
          const identifierPayload = (await this.runCli(this.cliPath, "search_graph", {
            project: projectName,
            query: identifierQuery,
            limit: pageSize,
            format: "json",
            max_output_tokens: 2000,
            include_connected: false,
          })) as SearchGraphPayload;
          identifierHits = parseSearchGraphHits(identifierPayload, projectName);
        } catch {
          identifierHits = [];
        }
      }

      let semanticHits: MemoryHit[] = [];
      try {
        semanticHits = parseSearchGraphHits(await semanticTask, projectName);
      } catch {
        semanticHits = [];
      }

      const hits = reconcileMemoryHits(semanticHits, identifierHits, identifierTerms(input));
      if (hits.length === 0 && semanticHits.length === 0 && identifierHits.length === 0) {
        return { hits: [], requestCount, projectName };
      }
      return {
        hits,
        requestCount,
        projectName,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Memory search failed.";
      return {
        hits: [],
        requestCount: Math.max(requestCount, 1),
        unavailableReason: reason,
      };
    }
  }

  private async listProjects(): Promise<IndexedProject[]> {
    const payload = (await this.runCli(this.cliPath, "list_projects", {
      format: "json",
      detail: "identity",
    })) as { projects?: IndexedProject[] };
    return payload.projects ?? [];
  }
}

export function resolveCliPath(configured: string): string {
  const trimmed = configured.trim() || "codebase-memory-mcp";
  if (trimmed !== "codebase-memory-mcp" && fs.existsSync(trimmed)) {
    return trimmed;
  }
  const localPath = path.join(os.homedir(), ".local", "bin", "codebase-memory-mcp");
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  return trimmed;
}

export function createDefaultCliRunner(timeoutMs: number): CliRunner {
  return async (cliPath, tool, args) => {
    try {
      const { stdout } = await execFileAsync(cliPath, ["cli", "--quiet", "--json", tool, JSON.stringify(args)], {
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
      return unwrapCliPayload(stdout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new MemoryUnavailableError(`codebase-memory-mcp CLI failed: ${message}`);
    }
  };
}

export function unwrapCliPayload(stdout: string): unknown {
  const envelope = JSON.parse(stdout) as {
    isError?: boolean;
    content?: Array<{ type?: string; text?: string }>;
  };
  if (envelope.isError) {
    const detail = envelope.content?.[0]?.text ?? "CLI returned isError=true";
    throw new MemoryUnavailableError(detail);
  }
  const text = envelope.content?.[0]?.text;
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export function resolveProjectName(
  projectRoot: string,
  projects: IndexedProject[],
  explicitName?: string,
): string | undefined {
  if (explicitName) {
    const exact = projects.find((project) => project.name === explicitName);
    return exact?.name ?? explicitName;
  }
  const normalizedRoot = normalizePath(projectRoot);
  const matches = projects.filter((project) => normalizePath(project.root_path ?? "") === normalizedRoot);
  if (matches.length === 0) {
    const fallback = path.basename(normalizedRoot);
    return projects.some((project) => project.name === fallback) ? fallback : undefined;
  }
  matches.sort((left, right) => left.name.length - right.name.length);
  const basename = path.basename(normalizedRoot);
  return matches.find((project) => project.name === basename)?.name ?? matches[0]?.name;
}

export function parseSearchGraphHits(payload: SearchGraphPayload, projectName: string): MemoryHit[] {
  const tables: Array<{ cols: string[]; rows: unknown[][] }> = [];
  if (payload.semantic?.rows) {
    tables.push({ cols: payload.semantic.cols ?? ["qn", "label", "file", "score"], rows: payload.semantic.rows });
  }
  if (payload.rows) {
    tables.push({ cols: payload.cols ?? ["qn", "label", "file", "score"], rows: payload.rows });
  }
  for (const group of payload.groups ?? []) {
    if (group.rows) {
      tables.push({ cols: group.cols ?? ["qn", "label", "file", "score"], rows: group.rows });
    }
  }

  const hits: MemoryHit[] = [];
  for (const table of tables) {
    const index = Object.fromEntries(table.cols.map((col, colIndex) => [col, colIndex]));
    for (const row of table.rows) {
      const qn = stringAt(row, index.qn);
      const file = stringAt(row, index.file);
      const label = stringAt(row, index.label);
      const score = coerceScore(numberAt(row, index.score), numberAt(row, index.rank));
      if (!qn && !file) {
        continue;
      }
      const id = qn || `${file}:${label}`;
      hits.push({
        id,
        source: file || undefined,
        score,
        symbols: qn ? [qn, lastSymbol(qn)].filter(Boolean) : undefined,
        content: formatHitContent({ qn, file, label, projectName }),
      });
    }
  }
  return hits;
}

function buildSemanticQuery(query: string): string[] {
  const primary = query.trim().slice(0, 500);
  return primary ? [primary] : ["code"];
}

function identifierTerms(input: MemorySearchInput): string[] {
  const fromInput = (input.identifiers ?? []).map((value) => value.trim()).filter((value) => value.length >= 3);
  if (fromInput.length > 0) {
    return uniqueTerms(fromInput).slice(0, 8);
  }
  return uniqueTerms(input.query.split(/[^\p{L}\p{N}_.-]+/u).filter((value) => /[A-Z]/.test(value) && value.length >= 3)).slice(
    0,
    8,
  );
}

function buildIdentifierQuery(input: MemorySearchInput): string | undefined {
  const terms = identifierTerms(input);
  return terms.length > 0 ? terms.join(" ") : undefined;
}

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function coerceScore(score?: number, rank?: number): number | undefined {
  if (typeof score === "number") {
    return score;
  }
  if (typeof rank !== "number") {
    return undefined;
  }
  if (rank >= 0 && rank <= 1) {
    return rank;
  }
  return 0.5 + Math.min(0.45, Math.abs(rank) / 40);
}

function formatHitContent(input: { qn?: string; file?: string; label?: string; projectName: string }): string {
  const symbol = input.qn ? lastSymbol(input.qn) : "unknown symbol";
  const source = input.file || "unknown path";
  const kind = input.label || "symbol";
  return `[UNVERIFIED memory from ${input.projectName}] ${kind} ${symbol} at ${source}. Confirm this path and symbol against the current repository before using it.${input.qn ? ` Qualified name: ${input.qn}.` : ""}`;
}

function lastSymbol(qn: string): string {
  const parts = qn.split(".").filter(Boolean);
  return parts[parts.length - 1] ?? qn;
}

function stringAt(row: unknown[], index: number | undefined): string | undefined {
  if (index === undefined) {
    return undefined;
  }
  const value = row[index];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberAt(row: unknown[], index: number | undefined): number | undefined {
  if (index === undefined) {
    return undefined;
  }
  const value = row[index];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePath(value: string): string {
  if (!value) {
    return "";
  }
  return path.resolve(value).replace(/\/+$/, "");
}
