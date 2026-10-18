# Prompt Optimizer

Cursor/VS Code extension that rewrites a prompt with **on-demand retrieval** from the Semantic Codebase Memory you already run, then **one** coding-model request. It does not implement code, start Cursor Agent, create a new index, or spawn sub-agents.

Memory backend: [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) (`codebase-memory-mcp` CLI). Embeddings and graph search stay inside that binary.

## Use

Open the **Prompt Optimizer** icon in the left Activity Bar.

1. Save **API URL**, **API key**, **call type** (`chat-completions` / `responses` / `messages`), and **effort**.
2. The sidebar shows the current time and when config was last saved.
3. Command Palette / `>prompt optimizer`: the result replaces the **active Agent chat input**. It does not open a new chat session. `workbench.action.chat.open` is not used because Cursor creates a new composer for that command.
4. Optimized prompts are stored in **History**.
5. Editor selection still works via right-click **Improve Prompt** or `Cmd+Alt+O`.

If VS Code Chat is available, `@optimizer` can rewrite a prompt there. Cursor Agent chat still uses the copy/optimize/paste path.

## Settings

- `promptOptimizer.profile` — `auto` (default), `simple`, `normal`, `complex`, `large`. Auto uses the local analyzer; it does not call the model a second time.
- `promptOptimizer.memory.cliPath` — existing `codebase-memory-mcp` binary
- `promptOptimizer.memory.tokenBudget` — override memory tokens; empty uses the profile. Long original prompts reduce memory first.
- `promptOptimizer.llm.provider` — `vscode` or `openai-compatible`
- `promptOptimizer.llm.apiStyle` — `chat-completions`, `responses`, or `messages`
- `promptOptimizer.llm.temperature` — default `0.1`
- `promptOptimizer.llm.maxOutputTokens` — empty uses the profile (`600` / `1200` / `2000` / `3000`)
- `promptOptimizer.llm.stream` — default `true`; still one request, no automatic retry
- `promptOptimizer.llm.reasoningEffort` — default `omit` unless the model documents the field
- `Prompt Optimizer: Set OpenAI-Compatible API Key` stores the key in Secret Storage

Default generation is latency-first: Normal profile, ~5K input budget, 1200 max output tokens, temperature 0.1, `n=1`, no tools. This is not the main coding-agent configuration.

If memory is down or the workspace is not indexed, the model still rewrites the original request and the prompt states that memory context is missing.

## Develop

```bash
npm install
npm test
npm run compile
```

Then press F5 (`Run Prompt Optimizer`) to open an Extension Development Host.
