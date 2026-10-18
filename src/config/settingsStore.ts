import * as vscode from "vscode";
import type { ApiStyle } from "../llm/openaiCompatibleClient";
import type { ReasoningEffort } from "../llm/modelProfile";

export const API_KEY_SECRET = "promptOptimizer.openaiApiKey";
const CONFIG_SAVED_AT_KEY = "promptOptimizer.configSavedAt";

export type EffortSetting = ReasoningEffort | "omit";

export type LlmUiConfig = {
  apiUrl: string;
  apiStyle: ApiStyle;
  effort: EffortSetting;
  model: string;
  hasApiKey: boolean;
  savedAt?: string;
};

export async function loadLlmUiConfig(context: vscode.ExtensionContext): Promise<LlmUiConfig> {
  const config = vscode.workspace.getConfiguration("promptOptimizer");
  const apiKey = (await context.secrets.get(API_KEY_SECRET)) || config.get<string>("llm.apiKey") || "";
  return {
    apiUrl: config.get<string>("llm.baseUrl") || "https://api.openai.com/v1",
    apiStyle: config.get<ApiStyle>("llm.apiStyle") || "chat-completions",
    effort: config.get<EffortSetting>("llm.reasoningEffort") || "omit",
    model: config.get<string>("llm.model") || "gpt-4.1",
    hasApiKey: Boolean(apiKey),
    savedAt: context.globalState.get<string>(CONFIG_SAVED_AT_KEY),
  };
}

export async function saveLlmUiConfig(
  context: vscode.ExtensionContext,
  input: {
    apiUrl: string;
    apiStyle: ApiStyle;
    effort: EffortSetting;
    model: string;
    apiKey?: string;
  },
): Promise<LlmUiConfig> {
  const config = vscode.workspace.getConfiguration("promptOptimizer");
  const target = vscode.ConfigurationTarget.Global;
  await config.update("llm.baseUrl", input.apiUrl.trim(), target);
  await config.update("llm.apiStyle", input.apiStyle, target);
  await config.update("llm.reasoningEffort", input.effort, target);
  await config.update("llm.model", input.model.trim() || "gpt-4.1", target);
  await config.update("llm.provider", "openai-compatible", target);

  const nextKey = input.apiKey?.trim();
  if (nextKey) {
    await context.secrets.store(API_KEY_SECRET, nextKey);
    await config.update("llm.apiKey", "", target);
  }

  const savedAt = new Date().toISOString();
  await context.globalState.update(CONFIG_SAVED_AT_KEY, savedAt);
  return loadLlmUiConfig(context);
}

export async function readApiKey(context: vscode.ExtensionContext): Promise<string> {
  const config = vscode.workspace.getConfiguration("promptOptimizer");
  return (await context.secrets.get(API_KEY_SECRET)) || config.get<string>("llm.apiKey") || "";
}
