# Cursor Prompt Optimizer

**VI** — Extension **Cursor** / **VS Code**: viết lại prompt **một lần** (prompt rewriter / improve prompt), dùng **Semantic Codebase Memory** (MCP `codebase-memory-mcp`) khi có, rồi đưa kết quả vào ô **Cursor Agent** / composer đang mở nếu có thể. Không viết code, không mở Agent mới, không tạo index mới, không spawn sub-agent.

**EN** — **Cursor** / **VS Code** extension: rewrite an AI coding prompt **once** (prompt optimizer / prompt rewriter), using **Semantic Codebase Memory** (MCP `codebase-memory-mcp`) when available, then put the result into the **current Cursor Agent** / composer input if possible. It does not write code, open a new Agent, create a new index, or spawn sub-agents.

Repo: [github.com/duongdanhdoan/cursor-prompt-optimizer](https://github.com/duongdanhdoan/cursor-prompt-optimizer)

## Keywords / Từ khóa

Search this repo / Tìm extension này trên Google, GitHub, VS Marketplace:

**EN:** Cursor prompt optimizer · Cursor AI extension · VS Code prompt optimizer · Cursor Agent prompt · Cursor composer prompt · Cursor chat prompt · improve Cursor prompt · rewrite prompt for Cursor · prompt rewriter · prompt engineering VS Code · LLM prompt optimizer · OpenAI-compatible prompt · Semantic Codebase Memory · MCP codebase-memory-mcp · BM25 identifier search · Cursor VSIX · vscode extension prompt · coding agent prompt · Agent input replace

**VI:** tối ưu prompt Cursor · extension Cursor · tối ưu prompt VS Code · viết lại prompt Agent Cursor · cải thiện prompt Cursor · prompt Cursor composer · tối ưu prompt AI · prompt engineering Cursor · bộ nhớ codebase ngữ nghĩa · MCP codebase memory · cài VSIX Cursor · extension tối ưu prompt · viết lại prompt coding · Cursor chat prompt

## Benefits / Lợi ích

- **VI:** Prompt thành **task contract 5 phần** — Context, Objective, Steps, Output, Constraints and Rules. Giữ ý định gốc, không tự bịa file/nguyên nhân, không kéo dài task đơn giản.
  **EN:** Output is a **five-section task contract** — Context, Objective, Steps, Output, Constraints and Rules. It keeps the original intent, does not invent files or causes, and does not inflate a simple task.

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

- **VI:** Thay ô Agent không phải API chính thức. Cursor không cho extension ghi `composer.text`. Trên macOS dùng Accessibility (focus composer, click đỉnh/đáy panel, Cmd+A/V). Có thể fail khi layout đổi hoặc chưa cấp Accessibility cho **Cursor**. Lúc đó prompt chỉ nằm trên clipboard.
  **EN:** Replacing Agent input is unofficial. Cursor does not expose `composer.text`. On macOS the extension uses Accessibility (focus composer, click the top and bottom of the panel, Cmd+A/V). This can fail after a layout change or if **Cursor** lacks Accessibility permission. Then the result stays on the clipboard.

- **VI:** Lần đầu có thể thay được, lần sau không. Chat *New Agent* để ô nhập phía trên. Extension click đỉnh và đáy, nhưng vẫn phụ thuộc UI Cursor và Accessibility — không đảm bảo 100%.
  **EN:** The first empty-input replace may work, later ones may not. Empty fields accept AX value writes; a long prompt grows the box. The click-at-bottom path is more robust but still depends on Cursor’s UI and Accessibility — not guaranteed.

- **VI:** Workspace chưa index semantic (ví dụ mode `fast`, ít node) → `memoryStatus=empty`; prompt vẫn được viết lại từ yêu cầu gốc.  
  **EN:** If the workspace has no semantic index (e.g. `fast` mode, few nodes) → `memoryStatus=empty`; the prompt is still rewritten from the original request alone.

- **VI:** Không đọc DOM chat Cursor. Bôi đen trong composer không phải editor selection. Command Palette **prompt optimizer** chỉ đọc ô Agent (macOS Accessibility), không lấy selection trong editor.
  **EN:** The extension cannot read Cursor chat DOM. Composer selection is not an editor selection. Command Palette **prompt optimizer** reads Agent input only (macOS Accessibility); it does not use the editor selection.

- **VI:** Windows/Linux không có AppleScript; kết quả copy clipboard, phải dán tay.  
  **EN:** Windows/Linux have no AppleScript path; the result is copied and must be pasted manually.

- **VI:** Không thay thế coding agent. Optimizer không chạy test, không sửa file, không khẳng định đúng nếu chưa verify path/symbol trong repo.  
  **EN:** This is not a coding agent. It does not run tests, edit files, or claim correctness until paths and symbols are verified in the repo.

## Install / Cài đặt

1. Download / Tải `cursor-prompt-optimizer-0.1.2.vsix` from [Releases](https://github.com/duongdanhdoan/cursor-prompt-optimizer/releases).
2. Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) → **Extensions: Install from VSIX…** → chọn file `.vsix`.
3. **Developer: Reload Window**.
4. **macOS (optional):** để tự thay ô Agent — **System Settings → Privacy & Security → Accessibility** → bật **Cursor**.

Memory MCP là tùy chọn. Không có index thì extension vẫn enhance từ prompt gốc (một lần gọi model).

**Optional memory:** cài [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp), đưa CLI vào `PATH` (lệnh mặc định `codebase-memory-mcp`; macOS thường `~/.local/bin/codebase-memory-mcp`). Index **workspace sẽ code** bằng `index_repository` mode `full` hoặc `moderate`. Extension **không** tự tạo index.

## First setup / Cấu hình lần đầu

1. Mở sidebar **Prompt Optimizer** (icon trên Activity Bar).
2. Điền:
   - **API URL** — ví dụ `https://api.openai.com/v1` (OpenAI-compatible).
   - **API style** — `chat-completions` (mặc định), `responses`, hoặc `messages`.
   - **Model** — model nhỏ/nhanh để rewrite prompt (không cần model Agent chính).
   - **Effort** — để `omit` trừ khi provider bắt buộc.
   - **API key** — dán vào ô password, **không** ghi vào `settings.json`.
3. **Save config**. Key nằm Secret Storage (macOS Keychain / Windows Credential Manager).
4. (Tùy chọn) Settings: `promptOptimizer.memory.cliPath` nếu CLI không nằm trên `PATH`.

Không Save key thì dùng provider `vscode` (language model trong editor) nếu có. `openai-compatible` cần key.

## Output / Kết quả

Mỗi lần Enhance trả **một** prompt Markdown, đúng 5 phần theo thứ tự:

1. **Context** — bối cảnh đã biết; phân biệt fact / assumption / unknown. Memory chỉ khi liên quan, kèm source, unverified.
2. **Objective** — đúng việc user hỏi; không thêm chiều phân tích ngoài yêu cầu.
3. **Steps** — quy trình tối thiểu. Câu hỏi đơn giản thì ngắn; bug/fix mới điều tra trước khi sửa.
4. **Output** — bàn giao gì (empty state, giải thích, patch…). Không bịa test/report.
5. **Constraints and Rules** — điều cấm và giới hạn gốc.

Không gọi model lần hai. Nếu output đổi chủ đề (ví dụ `recomProduct` → `_loadStores`) hoặc thiếu section, Output channel **Prompt Optimizer** ghi `warning …`. Pipeline có thể thay bằng contract local từ prompt gốc.

## Usage / Cách dùng

Chọn **một** luồng. Không mở Agent mới, không spawn sub-agent, không `index_repository`.

### 1. Sidebar (mọi OS — cách ổn định nhất)

**VI**
1. Copy prompt từ ô Agent, hoặc gõ vào textarea sidebar.
2. Bấm **Optimize** (hoặc **Optimize chat prompt** nếu vừa load clipboard).
3. Đợi notification: phân tích → memory → model → kiểm tra.
4. Sửa 5 ô nếu cần → **Copy to Cursor chat** → click ô Agent → dán (`Cmd+V` / `Ctrl+V`).

**EN**
1. Copy the Agent prompt, or type it in the sidebar.
2. Click **Optimize**.
3. Wait for the progress notification.
4. Edit the five sections if needed → **Copy to Cursor chat** → click the Agent box → paste.

Sidebar **không** tự ghi vào ô Agent.

### 2. Command Palette — ô Agent (macOS)

Chỉ macOS + Accessibility cho **Cursor**. Windows/Linux: dùng sidebar hoặc clipboard (mục 1 / 4).

**VI**
1. Gõ prompt trong ô Agent của **session đang mở** (không tạo chat mới).
2. `Cmd+Shift+P` → **Prompt Optimizer: prompt optimizer**.
3. Thành công: toast *Đã thay prompt trong ô Agent chat hiện tại.*
4. Fail: toast đã copy — click ô chat, `Cmd+V`. Xem Output **Prompt Optimizer** (`composer-ax …`, `composer.focusComposer …`).

Lệnh này **chỉ đọc ô Agent**. Không lấy text đang bôi trong editor (tránh enhance nhầm symbol trong file test).

**EN**
1. Type in the **open** Agent session.
2. Command Palette → **Prompt Optimizer: prompt optimizer**.
3. Success replaces the current Agent input. Failure copies; paste yourself.
4. This command does **not** fall back to the editor selection.

Does not call `workbench.action.chat.open` (that opens a new composer).

### 3. Editor selection (mọi OS)

**VI**
1. Bôi đen prompt trong file.
2. Chuột phải **Improve Prompt**, hoặc `Cmd+Alt+O` / `Ctrl+Alt+O`.
3. Preview: trái = gốc, phải = 5 phần sửa được. **Copy**, **Replace selection**, hoặc **Cancel**.

**EN** — Select text → **Improve Prompt** or `Ctrl+Alt+O` (`Cmd+Alt+O` on Mac). Preview, then copy / replace / cancel.

### 4. Clipboard (mọi OS)

1. Copy prompt (`Cmd+C` / `Ctrl+C`).
2. `Cmd+Alt+Shift+O` / `Ctrl+Alt+Shift+O`, hoặc Command Palette **Optimize Cursor Chat Prompt**.
3. macOS: cố gắng dán vào Agent. Windows/Linux: copy kết quả — dán tay (`Ctrl+V`).

## Platform

| | macOS | Windows / Linux |
| --- | --- | --- |
| Sidebar optimize + copy | Có | Có |
| Editor preview / replace | Có | Có |
| Đọc / thay ô Agent tự động | Có (Accessibility, không 100%) | Không — copy rồi `Ctrl+V` |
| API key Secret Storage | Keychain | Credential Manager |
| Memory MCP | CLI trên `PATH` | CLI trên `PATH`; set `memory.cliPath` nếu cần |

## Troubleshooting / Khi lệch kết quả

- **Enhance ra symbol khác** (`recomProduct` → `_loadStores`): bản này không lấy editor selection khi chạy từ ô Agent, và bỏ memory hit trong `tests/` / hit không chứa symbol gốc. Reload Window sau khi cài VSIX. Output **Prompt Optimizer** có `warning` nếu bị thay chủ đề.
- **Không đọc được ô Agent:** focus ô chat rồi chạy lại, hoặc copy vào sidebar. Windows luôn đi sidebar/clipboard.
- **Không thay được ô Agent (macOS):** cấp Accessibility cho **Cursor** (không phải Terminal). Chat *New Agent* để ô nhập phía trên; extension click cả đỉnh và đáy. Fail → `Cmd+V`.
- **memoryStatus=empty:** workspace chưa index MCP, hoặc index nhỏ. Vẫn enhance từ prompt gốc.
- **Không có API key:** Save key trên sidebar, hoặc bật language model editor (`promptOptimizer.llm.provider`: `vscode`).

## Memory

**Thứ tự thực tế / actual order**

1. **Codebase Memory MCP** — `search_graph` semantic + identifier (BM25). Hit trong `tests/` bị bỏ nếu task không phải test. Hit không chứa symbol trong prompt gốc bị bỏ.
2. **No memory** — vẫn một model call từ prompt gốc.

Cursor IDE index **không** nằm trong chuỗi này. Extension **không** gọi `index_repository`.

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
