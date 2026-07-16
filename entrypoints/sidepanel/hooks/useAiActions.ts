import { useState } from 'react';
import { dispatch } from '../store';
import type { AIPlan, AIProviderId } from '@/shared/ai';
import type { TabRecord } from '@/shared/types';
import { permissionOriginFor } from '@/core/ai/provider';

export function useAiActions(deps: { showFlash: (msg: string) => void }): {
  aiBusy: boolean;
  aiPlan: { plan: AIPlan; tabs: TabRecord[] } | null;
  setAiPlan: (v: { plan: AIPlan; tabs: TabRecord[] } | null) => void;
  aiOrganize: () => Promise<void>;
  applyAiPlan: (plan: AIPlan) => void;
  aiSuggestName: (contextId: string) => Promise<string | null>;
  saveAi: (provider: AIProviderId, key: string | undefined, model: string, baseUrl?: string) => Promise<void>;
  testAi: () => Promise<{ ok: boolean; detail: string }>;
} {
  const [aiPlan, setAiPlan] = useState<{ plan: AIPlan; tabs: TabRecord[] } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const aiOrganize = async () => {
    if (aiBusy) return;
    setAiBusy(true); // 持久「分析中」指示见下方 pill(AI 调用可能超过 flash 的 1.8s)
    const ev = await dispatch({ type: 'AI_ORGANIZE_INBOX' });
    setAiBusy(false);
    if (ev?.type === 'AI_PLAN') setAiPlan({ plan: ev.plan, tabs: ev.tabs });
    else if (ev?.type === 'AI_ERROR') {
      const msg: Record<string, string> = {
        no_key: '请先在设置里填 AI API key',
        permission: '未授权访问 API 域名',
        network: 'AI 调用失败,请稍后重试',
        parse: 'AI 没能给出可用的分组建议,已保持原样',
        empty: '未分类里没有可整理的标签',
        cancelled: '已取消 AI 整理',
      };
      deps.showFlash(msg[ev.reason] ?? 'AI 调用失败');
    }
  };

  const applyAiPlan = (plan: AIPlan) => {
    dispatch({ type: 'APPLY_AI_PLAN', plan });
    setAiPlan(null);
    deps.showFlash('已应用 AI 整理');
  };

  const aiSuggestName = async (contextId: string): Promise<string | null> => {
    try {
      const ev = await dispatch({ type: 'AI_SUGGEST_NAME', contextId });
      if (ev?.type === 'AI_NAME') return ev.name;
      if (ev?.type === 'AI_ERROR') {
        const msg: Record<string, string> = {
          no_key: '请先在设置里填 AI API key',
          empty: '这个任务里没有标签可参考',
          network: 'AI 调用失败,请稍后重试',
          parse: 'AI 没给出可用的名字',
          permission: '未授权访问 API 域名',
          cancelled: '已取消',
        };
        deps.showFlash(msg[ev.reason] ?? 'AI 调用失败');
      }
    } catch {
      deps.showFlash('AI 调用失败,请稍后重试'); // 如 SW 未就绪导致 sendMessage 失败
    }
    return null;
  };

  const saveAi = async (
    provider: AIProviderId,
    key: string | undefined,
    model: string,
    baseUrl?: string,
  ) => {
    // custom 的授权域名由所填 baseUrl 的 origin 派生;官方两档用固定 host(见 permissionOriginFor)
    const origin = permissionOriginFor(provider, baseUrl);
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error('需要授权访问 API 域名');
    await dispatch({ type: 'SET_AI_SETTINGS', provider, key, model, baseUrl });
  };

  const testAi = async (): Promise<{ ok: boolean; detail: string }> => {
    const ev = await dispatch({ type: 'TEST_AI_CONNECTION' });
    if (ev?.type === 'AI_TEST_RESULT') return { ok: ev.ok, detail: ev.detail };
    return { ok: false, detail: '测试失败' };
  };

  return { aiBusy, aiPlan, setAiPlan, aiOrganize, applyAiPlan, aiSuggestName, saveAi, testAi };
}
