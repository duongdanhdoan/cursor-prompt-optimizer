import * as vscode from "vscode";
import {
  ApiStyle,
  CodingModelClient,
  createOpenAICompatibleClient,
} from "./openaiCompatibleClient";
import { parseOptimizedPrompt } from "./responseParser";

export type ModelClientConfig = {
  provider: "vscode" | "openai-compatible";
  baseUrl: string;
  model: string;
  apiKey: string;
  apiStyle?: ApiStyle;
  stream?: boolean;
};

export function createCodingModelClient(config: ModelClientConfig): CodingModelClient {
  if (config.provider === "openai-compatible") {
    if (!config.apiKey) {
      throw new Error("Set an API key before using the openai-compatible provider.");
    }
    return createOpenAICompatibleClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      apiStyle: config.apiStyle,
      stream: config.stream,
    });
  }
  return createVscodeLanguageModelClient();
}

function createVscodeLanguageModelClient(): CodingModelClient {
  let calls = 0;
  return {
    async completeOnce(input) {
      calls += 1;
      if (calls > 1) {
        throw new Error("Coding model client refused a second request in this turn.");
      }

      const models = await vscode.lm.selectChatModels({});
      if (models.length === 0) {
        throw new Error("No editor language model is available. Switch provider to openai-compatible or enable a language model.");
      }

      const [model] = models;
      const response = await model.sendRequest(
        [vscode.LanguageModelChatMessage.User(`${input.system}\n\n${input.user}`)],
        {},
      );

      let raw = "";
      for await (const chunk of response.text) {
        raw += chunk;
      }
      return { text: parseOptimizedPrompt(raw) };
    },
  };
}
