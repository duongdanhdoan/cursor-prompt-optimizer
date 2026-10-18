import { parseOptimizedPrompt } from "./responseParser";
import type { ReasoningEffort } from "./modelProfile";

export type CodingModelCompleteInput = {
  system: string;
  user: string;
  abortSignal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
  stream?: boolean;
  reasoningEffort?: ReasoningEffort;
  sendTemperature?: boolean;
};

export interface CodingModelClient {
  completeOnce(input: CodingModelCompleteInput): Promise<{ text: string }>;
}

export type ApiStyle = "chat-completions" | "responses" | "messages";

export type OpenAICompatibleOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  apiStyle?: ApiStyle;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  stream?: boolean;
};

export type ChatCompletionsBody = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  max_tokens: number;
  n: 1;
  stream: boolean;
  temperature?: number;
  reasoning_effort?: ReasoningEffort;
};

export type ResponsesBody = {
  model: string;
  input: Array<{ role: "system" | "user"; content: string }>;
  max_output_tokens: number;
  stream: boolean;
  temperature?: number;
  reasoning?: { effort: ReasoningEffort };
};

export function buildChatCompletionsBody(
  model: string,
  input: CodingModelCompleteInput,
): ChatCompletionsBody {
  const body: ChatCompletionsBody = {
    model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    max_tokens: input.maxOutputTokens ?? 1_200,
    n: 1,
    stream: input.stream ?? true,
  };
  if (input.sendTemperature !== false) {
    body.temperature = input.temperature ?? 0.1;
  }
  if (input.reasoningEffort) {
    body.reasoning_effort = input.reasoningEffort;
  }
  return body;
}

export function buildResponsesBody(model: string, input: CodingModelCompleteInput): ResponsesBody {
  const body: ResponsesBody = {
    model,
    input: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    max_output_tokens: input.maxOutputTokens ?? 1_200,
    stream: input.stream ?? true,
  };
  if (input.sendTemperature !== false) {
    body.temperature = input.temperature ?? 0.1;
  }
  if (input.reasoningEffort) {
    body.reasoning = { effort: input.reasoningEffort };
  }
  return body;
}

export type MessagesBody = {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: "user"; content: string }>;
  stream: boolean;
  temperature?: number;
  reasoning_effort?: ReasoningEffort;
};

export function buildMessagesBody(model: string, input: CodingModelCompleteInput): MessagesBody {
  const body: MessagesBody = {
    model,
    max_tokens: input.maxOutputTokens ?? 1_200,
    system: input.system,
    messages: [{ role: "user", content: input.user }],
    stream: input.stream ?? true,
  };
  if (input.sendTemperature !== false) {
    body.temperature = input.temperature ?? 0.1;
  }
  if (input.reasoningEffort) {
    body.reasoning_effort = input.reasoningEffort;
  }
  return body;
}

export function apiStylePath(apiStyle: ApiStyle): string {
  if (apiStyle === "responses") {
    return "/responses";
  }
  if (apiStyle === "messages") {
    return "/messages";
  }
  return "/chat/completions";
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: unknown };
    delta?: { content?: unknown };
  }>;
};

type ResponsesApiResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

export function createOpenAICompatibleClient(options: OpenAICompatibleOptions): CodingModelClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const apiStyle = options.apiStyle ?? "chat-completions";
  let calls = 0;

  return {
    async completeOnce(input) {
      calls += 1;
      if (calls > 1) {
        throw new Error("Coding model client refused a second request in this turn.");
      }

      const stream = input.stream ?? options.stream ?? true;
      const request: CodingModelCompleteInput = { ...input, stream };
      const baseUrl = options.baseUrl.replace(/\/+$/, "");
      const path = apiStylePath(apiStyle);
      const body =
        apiStyle === "responses"
          ? buildResponsesBody(options.model, request)
          : apiStyle === "messages"
            ? buildMessagesBody(options.model, request)
            : buildChatCompletionsBody(options.model, request);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();
      input.abortSignal?.addEventListener("abort", onAbort, { once: true });

      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          Accept: stream ? "text/event-stream" : "application/json",
        };
        if (apiStyle === "messages") {
          headers["x-api-key"] = options.apiKey;
          headers["anthropic-version"] = "2023-06-01";
        }
        const response = await fetchImpl(`${baseUrl}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Coding model request failed (${response.status}).`);
        }

        const contentType = response.headers.get("content-type") ?? "";
        const text =
          stream && contentType.includes("text/event-stream")
            ? await readSseText(response, apiStyle)
            : await readJsonText(response, apiStyle);
        return { text: parseOptimizedPrompt(text) };
      } finally {
        clearTimeout(timeout);
        input.abortSignal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

async function readJsonText(response: Response, apiStyle: ApiStyle): Promise<string> {
  const payload = (await response.json()) as ChatCompletionResponse &
    ResponsesApiResponse & { content?: Array<{ type?: string; text?: string }> };
  if (apiStyle === "responses") {
    if (typeof payload.output_text === "string" && payload.output_text.trim()) {
      return payload.output_text;
    }
    const fromOutput = payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((part) => part.text ?? "")
      .join("");
    return fromOutput ?? "";
  }
  if (apiStyle === "messages") {
    const fromContent = payload.content?.map((part) => part.text ?? "").join("");
    if (fromContent) {
      return fromContent;
    }
  }
  return flattenContent(payload.choices?.[0]?.message?.content);
}

async function readSseText(response: Response, apiStyle: ApiStyle): Promise<string> {
  if (!response.body) {
    throw new Error("Coding model stream returned no body.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const payload = sseData(line);
      if (!payload) {
        continue;
      }
      text +=
        apiStyle === "responses"
          ? responsesDelta(payload)
          : apiStyle === "messages"
            ? messagesDelta(payload)
            : chatDelta(payload);
    }
  }
  return text;
}

function sseData(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return "";
  }
  const data = trimmed.slice(5).trim();
  return data === "[DONE]" ? "" : data;
}

function chatDelta(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as ChatCompletionResponse;
    return flattenContent(parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content);
  } catch {
    return "";
  }
}

function responsesDelta(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as { delta?: unknown; output_text?: unknown; text?: unknown };
    if (typeof parsed.delta === "string") {
      return parsed.delta;
    }
    if (typeof parsed.output_text === "string") {
      return parsed.output_text;
    }
    if (typeof parsed.text === "string") {
      return parsed.text;
    }
    return "";
  } catch {
    return "";
  }
}

function messagesDelta(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as {
      delta?: { type?: string; text?: string } | string;
      content_block?: { text?: string };
      text?: string;
    };
    if (typeof parsed.delta === "string") {
      return parsed.delta;
    }
    if (parsed.delta && typeof parsed.delta === "object" && typeof parsed.delta.text === "string") {
      return parsed.delta.text;
    }
    if (typeof parsed.content_block?.text === "string") {
      return parsed.content_block.text;
    }
    if (typeof parsed.text === "string") {
      return parsed.text;
    }
    return "";
  } catch {
    return "";
  }
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : "",
      )
      .join("");
  }
  return "";
}
