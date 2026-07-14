// AI 整理未分类的共享类型(F-13,见 spec)。UI 与 SW 共用。

export type AIProviderId = 'anthropic' | 'openai';

/** AI 提案:新建分组 + 并入已有任务;未提及的标签留在未分类。 */
export interface AIPlan {
  newGroups: { name: string; tabIds: string[] }[];
  assign: { taskId: string; tabIds: string[] }[];
}

/** 脱敏状态,随快照广播给 UI —— 永不含 key。 */
export interface AIStatus {
  provider: AIProviderId;
  hasKey: boolean;
  model: string;
}

export type AIErrorReason = 'no_key' | 'permission' | 'network' | 'parse' | 'empty';
