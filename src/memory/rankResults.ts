import type { PromptAnalysis } from "../prompt/analyzePrompt";
import type { MemoryHit } from "./MemoryAdapter";

export type RankOptions = {
  minScoreRatio?: number;
  projectRoot?: string;
};

const WEAK_SOURCE_MARKERS = ["<python-builtins>", "<builtins>", "node_modules/", ".local/bin"];

export function rankResults(hits: MemoryHit[], analysis: PromptAnalysis, options: RankOptions = {}): MemoryHit[] {
  const minScoreRatio = options.minScoreRatio ?? 0.15;
  const identifierNeedles = needlesFromAnalysis(analysis);
  const subjects = subjectNeedles(analysis);
  const scored = hits
    .filter((hit) => isEligibleHit(hit, options.projectRoot))
    .filter((hit) => analysis.taskType === "test" || !isTestSource(hit.source))
    .filter((hit) => isOnOriginalSubject(hit, subjects))
    .map((hit) => {
      const identifierBoost = identifierNeedles.some((needle) => matchesNeedle(hit, needle)) ? 0.4 : 0;
      const moduleBoost = analysis.modules.some((moduleName) => matchesNeedle(hit, moduleName)) ? 0.25 : 0;
      const pathBoost = analysis.filePaths.some((filePath) => matchesNeedle(hit, filePath)) ? 0.3 : 0;
      const testPenalty = analysis.taskType !== "test" && /(?:^|\/)(?:test|tests|spec|integration_test)\b/i.test(hit.source ?? "") ? -0.05 : 0;
      return {
        hit,
        rankScore: (hit.score ?? 0) + identifierBoost + moduleBoost + pathBoost + testPenalty,
        identifierMatch: identifierBoost > 0 || pathBoost > 0,
      };
    })
    .sort((left, right) => right.rankScore - left.rankScore);

  const topScore = scored[0]?.hit.score ?? 0;
  const threshold = topScore > 0 ? topScore * minScoreRatio : 0;
  const filtered = scored.filter((item) => item.identifierMatch || (item.hit.score ?? 0) >= threshold || topScore === 0);

  const unique = new Map<string, MemoryHit>();
  for (const item of filtered) {
    const key = item.hit.id;
    if (!unique.has(key)) {
      unique.set(key, { ...item.hit, score: item.rankScore });
    }
  }
  return [...unique.values()];
}

function subjectNeedles(analysis: PromptAnalysis): string[] {
  return [...analysis.identifiers, ...analysis.filePaths].filter((value) => value.length >= 6);
}

function isOnOriginalSubject(hit: MemoryHit, subjects: string[]): boolean {
  if (subjects.length === 0) {
    return true;
  }
  const haystack = `${hit.id} ${hit.source ?? ""} ${hit.symbols?.join(" ") ?? ""} ${hit.content}`.toLowerCase();
  return subjects.some((subject) => haystack.includes(subject.toLowerCase()));
}

function isTestSource(source?: string): boolean {
  const value = source ?? "";
  return /(?:^|\/)tests?(?:\/|$)/i.test(value) || /\.(?:test|spec)\.[A-Za-z0-9]+$/i.test(value);
}

function isEligibleHit(hit: MemoryHit, projectRoot?: string): boolean {
  const source = hit.source ?? "";
  const haystack = `${hit.id} ${source} ${hit.content}`;
  if (!source) {
    return false;
  }
  if (WEAK_SOURCE_MARKERS.some((marker) => haystack.includes(marker))) {
    return false;
  }
  if (hit.id.startsWith("builtins.") || source.startsWith("<")) {
    return false;
  }
  if (source.includes("..")) {
    return false;
  }
  if (projectRoot && pathIsOutside(source, projectRoot)) {
    return false;
  }
  return true;
}

function pathIsOutside(source: string, projectRoot: string): boolean {
  if (!source.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(source)) {
    return false;
  }
  const normalizedSource = source.replace(/\\/g, "/");
  const normalizedRoot = projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  return !normalizedSource.startsWith(`${normalizedRoot}/`) && normalizedSource !== normalizedRoot;
}

function needlesFromAnalysis(analysis: PromptAnalysis): string[] {
  return [...analysis.identifiers, ...analysis.filePaths, ...analysis.errorMessages.map((value) => value.slice(0, 40))];
}

function matchesNeedle(hit: MemoryHit, needle: string): boolean {
  if (!needle || needle.length < 3) {
    return false;
  }
  const haystack = `${hit.id} ${hit.source ?? ""} ${hit.symbols?.join(" ") ?? ""} ${hit.content}`.toLowerCase();
  return haystack.includes(needle.toLowerCase());
}
