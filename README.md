# Cursor Prompt Optimizer

**VI** — Extension **Cursor** / **VS Code**: viết lại prompt **một lần** (prompt rewriter / improve prompt), dùng **Semantic Codebase Memory** (MCP `codebase-memory-mcp`) khi có, rồi đưa kết quả vào ô **Cursor Agent** / composer đang mở nếu có thể. Không viết code, không mở Agent mới, không tạo index mới, không spawn sub-agent.

**EN** — **Cursor** / **VS Code** extension: rewrite an AI coding prompt **once** (prompt optimizer / prompt rewriter), using **Semantic Codebase Memory** (MCP `codebase-memory-mcp`) when available, then put the result into the **current Cursor Agent** / composer input if possible. It does not write code, open a new Agent, create a new index, or spawn sub-agents.

Repo: [github.com/duongdanhdoan/cursor-prompt-optimizer](https://github.com/duongdanhdoan/cursor-prompt-optimizer)

## Keywords / Từ khóa

Search this repo / Tìm extension này trên Google, GitHub, VS Marketplace:

**EN:** Cursor prompt optimizer · Cursor AI extension · VS Code prompt optimizer · Cursor Agent prompt · Cursor composer prompt · Cursor chat prompt · improve Cursor prompt · rewrite prompt for Cursor · prompt rewriter · prompt engineering VS Code · LLM prompt optimizer · OpenAI-compatible prompt · Semantic Codebase Memory · MCP codebase-memory-mcp · BM25 identifier search · Cursor VSIX · vscode extension prompt · coding agent prompt · Agent input replace

**VI:** tối ưu prompt Cursor · extension Cursor · tối ưu prompt VS Code · viết lại prompt Agent Cursor · cải thiện prompt Cursor · prompt Cursor composer · tối ưu prompt AI · prompt engineering Cursor · bộ nhớ codebase ngữ nghĩa · MCP codebase memory · cài VSIX Cursor · extension tối ưu prompt · viết lại prompt coding · Cursor chat prompt

## Benefits / Lợi ích

- **VI:** Prompt gọn, đúng task — model chỉ trả một prompt hoàn chỉnh, không thêm Goal/Scope/checklist nếu bạn không viết sẵn.  
  **EN:** Compact, task-true output — one complete prompt, no Goal/Scope checklist unless the original already used that shape.

- **VI:** Bối cảnh từ codebase thật — khi MCP đã index (`full`/`moderate`), retrieval gồm semantic + identifier (BM25). Symbol như `ProductCard` được ưu tiên hơn hit semantic lệch.  
  **EN:** Real codebase context — with a `full`/`moderate` MCP index, retrieval is semantic + identifier (BM25). Identifiers such as `ProductCard` outrank weak semantic hits.

- **VI:** Một request coding model mỗi lần Improve — analyzer local, không LLM thứ hai, không retry tự động, không tool call.  
  **EN:** One coding-model request per Improve — local analyzer, no second LLM, no automatic retry, no tool calls.

- **VI:** Giới hạn token — profile latency-first (`simple`/`normal`/`complex`/`large`). Prompt gốc không bị cắt; memory bị giảm trước nếu input dài.  
  **EN:** Token budget — latency-first profiles. The original prompt is never truncated; memory is reduced first when input is long.

- **VI:** Trong Cursor, Command Palette `Prompt Optimizer: prompt optimizer` cố gắng **thay ô nhập Agent hiện tại**, không tạo chat session mới.  
  **EN:** In Cursor, Command Palette `Prompt Optimizer: prompt optimizer` tries to **replace the active Agent input**, without opening a new chat.

- **VI:** Sidebar lưu API URL, key (Secret Storage), kiểu gọi (`chat-completions` / `responses` / `messages`), effort, và history.  
  **EN:** Sidebar stores API URL, key (Secret Storage), call type, effort, and history.

## Limitations / Hạn chế

- **VI:** Không dùng được index nội bộ của Cursor. Agent/`@codebase` dùng index riêng; extension không có API công khai để query. Memory chỉ đến từ [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp). Hai hệ thống không chia hit.  
  **EN:** Cursor’s built-in codebase index is not accessible. Agent/`@codebase` uses a private index with no public extension API. Optimizer memory comes only from [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp). The two indexes do not share hits.

- **VI:** Thay ô Agent không phải API chính thức. Cursor không cho extension ghi `composer.text`. Trên macOS dùng Accessibility (focus composer, click đáy panel, Cmd+A/V). Có thể fail khi ô đã có nội dung dài, layout đổi, hoặc quyền Accessibility chưa cấp cho **Cursor**. Lúc đó prompt chỉ nằm trên clipboard.  
  **EN:** Replacing Agent input is unofficial. Cursor does not expose `composer.text`. On macOS the extension uses Accessibility (focus composer, click the bottom of the panel, Cmd+A/V). This can fail after a long prompt, a layout change, or if **Cursor** lacks Accessibility permission. Then the result stays on the clipboard.

- **VI:** Lần đầu có thể thay được, lần sau không. Ô trống dễ ghi AX; prompt dài làm ô phình lên. Đã đổi sang click đáy panel, nhưng vẫn phụ thuộc UI Cursor và Accessibility — không đảm bảo 100%.  
  **EN:** The first empty-input replace may work, later ones may not. Empty fields accept AX value writes; a long prompt grows the box. The click-at-bottom path is more robust but still depends on Cursor’s UI and Accessibility — not guaranteed.

- **VI:** Workspace chưa index semantic (ví dụ mode `fast`, ít node) → `memoryStatus=empty`; prompt vẫn được viết lại từ yêu cầu gốc.  
  **EN:** If the workspace has no semantic index (e.g. `fast` mode, few nodes) → `memoryStatus=empty`; the prompt is still rewritten from the original request alone.

- **VI:** Không đọc DOM chat Cursor. Bôi đen trong composer không phải editor selection. Command Palette đọc ô Agent qua Accessibility (macOS) hoặc clipboard.  
  **EN:** The extension cannot read Cursor chat DOM. Composer selection is not an editor selection. Command Palette reads Agent input via Accessibility (macOS) or the clipboard.

- **VI:** Windows/Linux không có AppleScript; kết quả copy clipboard, phải dán tay.  
  **EN:** Windows/Linux have no AppleScript path; the result is copied and must be pasted manually.

- **VI:** Không thay thế coding agent. Optimizer không chạy test, không sửa file, không khẳng định đúng nếu chưa verify path/symbol trong repo.  
  **EN:** This is not a coding agent. It does not run tests, edit files, or claim correctness until paths and symbols are verified in the repo.

## Install / Cài đặt

1. Download / Tải `cursor-prompt-optimizer-0.1.0.vsix` from [Releases](https://github.com/duongdanhdoan/cursor-prompt-optimizer/releases).
2. Command Palette → **Extensions: Install from VSIX…**
3. Reload Window.
4. **macOS:** to auto-replace Agent input — **System Settings → Privacy & Security → Accessibility → Cursor**.

Cần / Requires `codebase-memory-mcp` (default `~/.local/bin/codebase-memory-mcp`) and a workspace indexed with `index_repository` mode `full` or `moderate`.

## Usage / Cách dùng

### Command Palette (Agent input)

**VI**
1. Gõ prompt trong ô Agent của **session đang mở**.
2. Cmd+Shift+P → **Prompt Optimizer: prompt optimizer**.
3. Thành công: toast *Đã thay prompt trong ô Agent chat hiện tại.*
4. Fail: toast bảo đã copy — click lại ô chat, Cmd+V. Xem Output **Prompt Optimizer** (`composer-ax …`).

**EN**
1. Type the prompt in the Agent box of the **open session**.
2. Cmd+Shift+P → **Prompt Optimizer: prompt optimizer**.
3. Success: toast *Đã thay prompt trong ô Agent chat hiện tại.*
4. Failure: toast says it was copied — click the chat box, Cmd+V. Check Output **Prompt Optimizer** (`composer-ax …`).

Does not call `workbench.action.chat.open` (that creates a new composer).

### Sidebar

**VI** — Icon **Prompt Optimizer** trên Activity Bar: cấu hình API, Optimize, History. Sidebar không ghi vào ô Agent trừ khi bạn copy kết quả.  
**EN** — **Prompt Optimizer** Activity Bar icon: API config, Optimize, History. The sidebar does not write into Agent input unless you copy the result.

### Editor

**VI** — Bôi đen trong file → chuột phải **Improve Prompt** hoặc `Cmd+Alt+O`.  
**EN** — Select text in a file → right-click **Improve Prompt** or `Cmd+Alt+O`.

## Memory

**VI — thứ tự thực tế / EN — actual order**

1. **Codebase Memory MCP** — `search_graph` semantic + identifier.
2. **No memory** — still one model call from the original prompt.

Cursor IDE index is **not** in this chain / Index Cursor (IDE) **không** nằm trong chuỗi này.

## Settings

| Setting | VI | EN |
| --- | --- | --- |
| `promptOptimizer.profile` | `auto` / `simple` / `normal` / `complex` / `large` | same |
| `promptOptimizer.memory.cliPath` | Đường dẫn `codebase-memory-mcp` | Path to `codebase-memory-mcp` |
| `promptOptimizer.memory.tokenBudget` | Override ngân sách memory; trống thì theo profile | Memory token override; empty uses the profile |
| `promptOptimizer.llm.provider` | `vscode` hoặc `openai-compatible` | `vscode` or `openai-compatible` |
| `promptOptimizer.llm.apiStyle` | `chat-completions`, `responses`, `messages` | same |
| `promptOptimizer.llm.temperature` | Mặc định `0.1` | Default `0.1` |
| `promptOptimizer.llm.maxOutputTokens` | Trống: 600 / 1200 / 2000 / 3000 theo profile | Empty: 600 / 1200 / 2000 / 3000 by profile |
| `promptOptimizer.llm.stream` | Mặc định `true`; một request, không retry | Default `true`; one request, no retry |
| `promptOptimizer.llm.reasoningEffort` | Mặc định `omit` | Default `omit` |

Key: **Prompt Optimizer: Set OpenAI-Compatible API Key** (Secret Storage).

## Develop

```bash
npm install
npm test
npm run compile
```

F5 → `Run Prompt Optimizer`. Package: `npx @vscode/vsce package --allow-star-activation`.
