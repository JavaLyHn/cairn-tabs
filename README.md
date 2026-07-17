<div align="center">

<img src="./.github/assets/logo.svg" width="88" height="88" alt="Cairn Tabs logo" />

# Cairn Tabs

**A tab context manager for developers.** Automatically groups your browser tabs by task, archives and restores whole tasks in one click, and searches everything instantly. A Chrome / Edge side-panel extension — local-first, no account.

English · [简体中文](./README.zh-CN.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md)

</div>

---

> A **cairn** is a stack of stones that marks a mountain trail — a landmark for your scattered tabs.
> Originally codenamed TabCtx; see [`tabctx-prd-tech-spec.md`](./tabctx-prd-tech-spec.md).

## Features

The MVP core loop, v1.1 developer specialization, and v1.5 AI are all implemented and working (currently 1.0):

- **Sidebar** — a real-time view of your current tabs grouped by task; a stats bar and bottom status bar; one-click **expand / collapse all** from the header (active tasks + Inbox).
- **Manual tasks** — create / rename / delete; drag tabs between tasks.
- **Archive / restore whole tasks** — one click to archive-and-close, one click to restore (rate-limited reopen); 5-second undo.
- **Organize everything with AI** — an "✦ Organize all" button in the header re-clusters **all open tabs** at once, moving tabs across groups to minimize leftovers. **Starred and manually placed tabs stay put**; empty groups are cleaned up; preview shows each tab's original group, and the whole reorg is **undoable in one click**. (The Inbox keeps its own conservative "✦ AI organize"; see below.)
- **Session recovery** — your tasks survive a browser restart. On restart, tabs are re-bound to their records by URL and tasks reconnect to their native groups by title, so nothing is lost. If Chrome did not restore a task's tabs at all, that task is **auto-archived** (URLs kept) so you can bring it back with one click.
- **Duplicate detection & merge** (F-05) — flags same-URL duplicates; one click to merge (keeps the most recently active).
- **Global search** (`⌘⇧K`) — fuzzy-matches open and archived tabs with fuse.js; `↵` jumps to a tab, `⌘↵` restores the whole task. Opens as a launcher showing your recent and ★ starred tabs before you type.
- **Two-way native tabGroups sync** (F-06) — Inbox = ungrouped; each named task = one native tab group, titles/colors mapped 1:1; group add / remove / edit on the native side syncs back, and manually created groups are auto-adopted.
- **Auto-grouping engine** (F-07) — new tabs are scored by opener chain / time window / domain and join an **existing task** only when confident enough (e.g. a tab opened from a tab already in that task); otherwise they stay in the **Inbox**. It learns from corrections (dragging out records a negative sample; manual assignment locks it), conservative by default — it prefers the Inbox over misfiling. **Creating a new task (a new group) always requires your confirmation** — it never auto-promotes Inbox tabs into a new task. **Same-site suggestion**: when enough Inbox tabs share a site (eTLD+1) (threshold default 4, adjustable 2–8 in settings), a "group" suggestion appears at the top and becomes a new task **only when you confirm**. The whole engine **can be turned off in settings** (then new tabs only go to the Inbox).
- **localhost project-name mapping** (F-08) — `localhost:3000` shows the project name you bind (e.g. `auth-service`); the port is rendered in monospace at the end of the row; unbound ports get an inline one-click bind suggestion.
- **GitHub / Bitbucket metadata** (F-09) — GitHub PR/Issue and Bitbucket Cloud PR/Issue rows show a "type + number" monospace badge (`PR #482` / `#212`), with `owner/repo` on hover (`workspace/repo` for Bitbucket); GitHub also strips the long trailing title, keeping only the real one. Pure URL parsing — zero requests, zero permissions.
- **Star (highlight)** — hover a tab row and star it as a "highlight": starred tabs float to the top of their task, are gathered into the "★ Highlights" section at the top of the panel for quick access, and are **never marked stale/sunk and never auto-discarded** (the system won't take away what you care about). Stars survive archive/restore.
- **AI rename** (needs AI configured) — when renaming a task, the "✦ AI" button next to the input asks the AI to suggest a short task name from that task's tab titles + domains and fills it in for you to confirm or edit (sends only titles + domains, never auto-applies; while running the button becomes "✦ Cancel" to abort).
- **Stale detection** (F-10) — open tabs not visited for more than a threshold (default 7 days, adjustable) are pulled out of their tasks into a dimmed "sunk" area at the bottom, with a one-click "Archive all" (undoable). No notifications; can be disabled in settings.
- **Tab discard & memory reclaim** (F-11) — **off by default**; when on, scans every 5 minutes and discards tabs idle beyond a threshold (default 30 min, adjustable) that are non-active / non-audible / non-pinned and not localhost, freeing memory (click to auto-reload); the bottom status bar shows the cumulative estimated reclaim. A localhost whitelist protects your dev server.
- **Export & import** (F-12) — one-click export of a task to Markdown (title + links, copied to clipboard, for standups / Notion); in settings, "Export all data (JSON)" backs everything up and "Import JSON" restores it. Import is **additive and non-destructive** — imported tasks land in Archived and existing data is never overwritten, so it's safe for backup / migration across machines.
- **AI-organize the Inbox** (F-13, optional) — after entering your own Anthropic / OpenAI API key, an "✦ AI organize" button appears in the Inbox header; the AI reads tab titles + domains **and each existing task's domains + sample titles**, then proposes new tasks or **merging into a suitable existing task**, applied after preview. **You can cancel mid-analysis.** Off by default; sends only titles + domains + task names (including existing tasks' domains/samples), connects directly to the official API, and the key stays on your machine.
  - **Custom relay** — besides the official APIs you can choose a "custom relay", entering an OpenAI-compatible endpoint (e.g. `https://newapi.elevatesphere.com/v1`) + key + model to connect to your own relay. The privacy boundary is unchanged (still only titles + domains + task names), the key stays local, and permission is scoped only to the host you enter.
  - **Test connection** — a one-click "Test connection" in settings fires a tiny request to verify the key / endpoint / model, with instant feedback `✓ Connected · model · Nms` or a plain-language error (auth failed / endpoint or model not found / timeout / network error…).

- **Multilingual UI** — the whole interface ships in English, 简体中文, 日本語, and 한국어; it follows your browser's UI language by default and can be switched anytime in Settings.

Not yet implemented (see the design-doc Roadmap): Firefox support, cross-device sync.

## Install & use

Not yet on the store — build it once and load it as an "unpacked extension" for long-term use (no account, no server, all data stays local).

**Prerequisites:** [Node](https://nodejs.org) 20+ and [pnpm](https://pnpm.io) (`npm i -g pnpm`).

**1. Build**

```bash
git clone https://github.com/JavaLyHn/cairn-tabs.git
cd cairn-tabs
pnpm install
pnpm build          # output in .output/chrome-mv3
```

**2. Load into your browser** (Chrome / Edge)

1. Open `chrome://extensions` (`edge://extensions` on Edge).
2. Enable **Developer mode** (top right).
3. Click **"Load unpacked"** and select the **`.output/chrome-mv3`** directory in the project.
4. **Pin** the toolbar icon; click it to open the side panel (or use `⌘⇧O` / `Ctrl+Shift+O` to open the panel, `⌘⇧K` / `Ctrl+Shift+K` to open search).

> ⚠️ Be sure to pick **`.output/chrome-mv3`** (the production build — self-contained, works out of the box). `.output/chrome-mv3-dev` is the dev build and **requires** `pnpm dev` to keep running or it shows a blank panel — don't load it for normal use.

**3. Update to a new version**

```bash
git pull && pnpm build
```

Then go to `chrome://extensions` and click the extension's **Refresh ↻** (no need to remove and re-add).

**4. (Optional) Enable AI** — Settings ⚙ → AI organize → pick a provider and enter your API key (or a custom relay's endpoint + key + model) → click "Test connection" to confirm → save. Off by default; sends only tab titles + domains + task names.

**Data & backup:** all tasks/tabs live in the browser's local IndexedDB and are never uploaded. Use "Export all data (JSON)" in settings to back up any time, and "Import JSON" to restore or move to another machine (imported tasks arrive in Archived; nothing existing is overwritten).

## Tech stack

WXT (Manifest V3) · React 19 · TypeScript · Tailwind CSS · Dexie (IndexedDB) · Zustand · fuse.js · Vitest

Architecture highlights: the Service Worker is the sole writer; the UI only sends commands and subscribes to state snapshots; every self-initiated tab/group operation runs inside a sync lock to avoid event loops; after the SW sleeps it rebuilds and reconciles via hydrate + reconcile.

## Development

```bash
pnpm install
pnpm dev        # start the dev server (HMR); doesn't open a browser — load .output/chrome-mv3-dev manually
pnpm build      # production build to .output/chrome-mv3
pnpm compile    # type-check (tsc --noEmit)
pnpm test       # run Vitest
```

For normal use, see [Install & use](#install--use) above. For development, use `pnpm dev` and load `.output/chrome-mv3-dev` (supports hot reload, but needs the dev server running or the panel is blank).

## Project structure

```
core/            UI-agnostic domain logic (unit-testable)
  store/         Dexie schema and repository layer
  background/    SW: tab sync / command handling / native group sync / undo / sync lock
  search/        fuse.js index
entrypoints/     WXT entry points: background + sidepanel (React)
shared/          types and the message protocol
tests/           Vitest (incl. fake-chrome integration tests)
docs/            design docs
```

## Contributing

Contributions welcome — please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## License

[AGPL-3.0-only](./LICENSE) © JavaLyHn. Derivative works (including networked SaaS) must be open-sourced under the same license.
