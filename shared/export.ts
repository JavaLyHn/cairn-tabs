// 导出(F-12,见 PRD §7.7)。纯函数:任务 → Markdown;全量 → JSON 备份。

import type { Context, TabRecord } from './types';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 标题里的 [] 会破坏 Markdown 链接,去掉;换行压成空格。 */
function safeTitle(title: string): string {
  return title.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim() || '(无标题)';
}

/**
 * 单个任务 → Markdown:
 * ## 任务名 (日期)
 * - [标题](url)
 */
export function contextToMarkdown(ctx: Context, orderedTabs: TabRecord[]): string {
  const date = fmtDate(ctx.archivedAt ?? ctx.createdAt);
  const lines = orderedTabs.map((t) => `- [${safeTitle(t.title)}](${t.url})`);
  return `## ${ctx.name} (${date})\n${lines.join('\n')}\n`;
}

/** 单个任务 → JSON(结构与全量备份一致,便于日后再导入)。 */
export function contextToJSON(ctx: Context, orderedTabs: TabRecord[], exportedAt: number): string {
  return JSON.stringify(
    { app: 'cairn-tabs', version: 1, exportedAt, contexts: [ctx], tabs: orderedTabs },
    null,
    2,
  );
}

/** 全量 JSON 备份(可作数据迁移;日后支持再导入)。 */
export function exportAllJSON(contexts: Context[], tabs: TabRecord[], exportedAt: number): string {
  return JSON.stringify({ app: 'cairn-tabs', version: 1, exportedAt, contexts, tabs }, null, 2);
}
