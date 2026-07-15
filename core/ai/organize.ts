// AI 整理:prompt 构建 + 响应解析(F-13)。provider 无关的纯逻辑,重点单测。

import type { AIPlan } from '@/shared/ai';

export interface OrganizeTab {
  id: string;
  title: string;
  domain: string;
}
export interface OrganizeTask {
  id: string;
  name: string;
}

export function buildOrganizePrompt(
  tabs: OrganizeTab[],
  tasks: OrganizeTask[],
): { system: string; user: string } {
  const system = [
    '你是帮程序员整理浏览器标签的助手。',
    '把「零散标签」按任务/主题归类:可新建命名分组,或并入某个「已有任务」。',
    '规则:',
    '- 保守:拿不准就不要归类(该标签不出现在输出里,自动留在未分类)。',
    '- 明显属于某个已有任务时,优先并入该任务而不是新建同类分组。',
    '- 新建分组名简短(不超过 16 字),语言与标签标题一致。',
    '- 只输出严格 JSON,不要任何解释、不要 Markdown 代码块。',
    'JSON 结构:',
    '{"newGroups":[{"name":"组名","tabIds":["标签id"]}],"assign":[{"taskId":"任务id","tabIds":["标签id"]}]}',
  ].join('\n');
  const user = JSON.stringify({
    looseTabs: tabs.map((t) => ({ id: t.id, title: t.title, domain: t.domain })),
    existingTasks: tasks.map((t) => ({ id: t.id, name: t.name })),
  });
  return { system, user };
}

export function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1]! : s).trim();
}

/** AI 改名:据一组标签的标题+域名建议一个简短任务名。 */
export function buildNamePrompt(tabs: { title: string; domain: string }[]): {
  system: string;
  user: string;
} {
  const system = [
    '你为一组浏览器标签起一个简短的任务名。',
    '规则:',
    '- 概括这些标签共同的任务/主题。',
    '- 简短:不超过 12 个字;不要引号、书名号、标点包裹;不要解释。',
    '- 语言与标签标题一致。',
    '- 只输出这个名字本身,一行。',
  ].join('\n');
  const user = JSON.stringify({ tabs: tabs.map((t) => ({ title: t.title, domain: t.domain })) });
  return { system, user };
}

/** 解析 AI 改名响应:去围栏/首尾引号、取首行、截断;空则 null。 */
export function parseNameResponse(raw: string): string | null {
  const first = stripFences(raw).split('\n')[0] ?? '';
  const name = first.trim().replace(/^["'「『《]+|["'」』》]+$/g, '').trim();
  return name ? name.slice(0, 40) : null;
}

export function parseOrganizeResponse(
  raw: string,
  validTabIds: Set<string>,
  validTaskIds: Set<string>,
): AIPlan | null {
  let data: unknown;
  try {
    data = JSON.parse(stripFences(raw));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const seen = new Set<string>(); // 一个标签至多归一处
  const takeTabs = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const x of arr) {
      if (typeof x === 'string' && validTabIds.has(x) && !seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  };

  const d = data as { newGroups?: unknown; assign?: unknown };

  // Process assign first so existing tasks win in dedup
  const assign: AIPlan['assign'] = [];
  if (Array.isArray(d.assign)) {
    for (const a of d.assign) {
      if (!a || typeof a !== 'object') continue;
      const rawTaskId = (a as { taskId?: unknown }).taskId;
      const taskId = typeof rawTaskId === 'string' ? rawTaskId : '';
      if (!validTaskIds.has(taskId)) continue;
      const tabIds = takeTabs((a as { tabIds?: unknown }).tabIds);
      if (tabIds.length) assign.push({ taskId, tabIds });
    }
  }

  // Then process newGroups
  const newGroups: AIPlan['newGroups'] = [];
  if (Array.isArray(d.newGroups)) {
    for (const g of d.newGroups) {
      if (!g || typeof g !== 'object') continue;
      const rawName = (g as { name?: unknown }).name;
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      const tabIds = takeTabs((g as { tabIds?: unknown }).tabIds);
      if (name && tabIds.length) newGroups.push({ name: name.slice(0, 40), tabIds });
    }
  }

  if (newGroups.length === 0 && assign.length === 0) return null;
  return { newGroups, assign };
}
