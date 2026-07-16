import { useState } from 'react';
import { dispatch } from '../store';
import type { AIPlan, AIProviderId } from '@/shared/ai';
import type { TabRecord } from '@/shared/types';
import { permissionOriginFor } from '@/core/ai/provider';
import { logError } from '@/shared/log';
import { useT } from '../i18n';

export function useAiActions(deps: {
  showFlash: (msg: string) => void;
  setUndo: (u: { action: string; token: string; ttlMs: number }) => void;
}): {
  aiBusy: boolean;
  aiPlan: { plan: AIPlan; tabs: TabRecord[]; scope: 'inbox' | 'all' } | null;
  setAiPlan: (v: { plan: AIPlan; tabs: TabRecord[]; scope: 'inbox' | 'all' } | null) => void;
  aiOrganize: () => Promise<void>;
  aiOrganizeAll: () => Promise<void>;
  applyAiPlan: (plan: AIPlan, opts?: { global?: boolean }) => void;
  aiSuggestName: (contextId: string) => Promise<string | null>;
  saveAi: (
    provider: AIProviderId,
    key: string | undefined,
    model: string,
    baseUrl?: string,
  ) => Promise<void>;
  testAi: () => Promise<{ ok: boolean; detail: string }>;
} {
  const { t } = useT();

  const [aiPlan, setAiPlan] = useState<{
    plan: AIPlan;
    tabs: TabRecord[];
    scope: 'inbox' | 'all';
  } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const aiOrganize = async () => {
    if (aiBusy) return;
    setAiBusy(true); // 持久「分析中」指示见下方 pill(AI 调用可能超过 flash 的 1.8s)
    const ev = await dispatch({ type: 'AI_ORGANIZE_INBOX' });
    setAiBusy(false);
    if (ev?.type === 'AI_PLAN') setAiPlan({ plan: ev.plan, tabs: ev.tabs, scope: 'inbox' });
    else if (ev?.type === 'AI_ERROR') {
      const msg: Record<string, string> = {
        no_key: t('ai.error.no_key'),
        permission: t('ai.error.permission'),
        network: t('ai.error.network'),
        parse: t('ai.error.parse'),
        empty: t('ai.error.empty.inbox'),
        cancelled: t('ai.error.cancelled'),
      };
      deps.showFlash(msg[ev.reason] ?? t('ai.error.default'));
    }
  };

  const aiOrganizeAll = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    const ev = await dispatch({ type: 'AI_ORGANIZE_ALL' });
    setAiBusy(false);
    if (ev?.type === 'AI_PLAN') setAiPlan({ plan: ev.plan, tabs: ev.tabs, scope: 'all' });
    else if (ev?.type === 'AI_ERROR') {
      const msg: Record<string, string> = {
        no_key: t('ai.error.no_key'),
        permission: t('ai.error.permission'),
        network: t('ai.error.network'),
        parse: t('ai.error.parse'),
        empty: t('ai.error.empty.all'),
        cancelled: t('ai.error.cancelled'),
      };
      deps.showFlash(msg[ev.reason] ?? t('ai.error.default'));
    }
  };

  const applyAiPlan = async (plan: AIPlan, opts?: { global?: boolean }) => {
    const ev = await dispatch({ type: 'APPLY_AI_PLAN', plan, global: opts?.global });
    setAiPlan(null);
    if (opts?.global && ev?.type === 'UNDOABLE') {
      deps.setUndo({ action: ev.action, token: ev.token, ttlMs: ev.ttlMs });
      deps.showFlash(t('ai.flash.organizedAll'));
    } else {
      deps.showFlash(t('ai.flash.applied'));
    }
  };

  const aiSuggestName = async (contextId: string): Promise<string | null> => {
    try {
      const ev = await dispatch({ type: 'AI_SUGGEST_NAME', contextId });
      if (ev?.type === 'AI_NAME') return ev.name;
      if (ev?.type === 'AI_ERROR') {
        const msg: Record<string, string> = {
          no_key: t('ai.error.no_key'),
          empty: t('ai.error.name.empty'),
          network: t('ai.error.network'),
          parse: t('ai.error.name.parse'),
          permission: t('ai.error.permission'),
          cancelled: t('ai.error.name.cancelled'),
        };
        deps.showFlash(msg[ev.reason] ?? t('ai.error.default'));
      }
    } catch (e) {
      logError('aiSuggestName', e); // 如 SW 未就绪导致 sendMessage 失败
      deps.showFlash(t('ai.error.network'));
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
    if (!granted) throw new Error(t('settings.ai.permissionRequired'));
    await dispatch({ type: 'SET_AI_SETTINGS', provider, key, model, baseUrl });
  };

  const testAi = async (): Promise<{ ok: boolean; detail: string }> => {
    const ev = await dispatch({ type: 'TEST_AI_CONNECTION' });
    if (ev?.type === 'AI_TEST_RESULT') return { ok: ev.ok, detail: ev.detail };
    return { ok: false, detail: t('settings.ai.testFailed') };
  };

  return {
    aiBusy,
    aiPlan,
    setAiPlan,
    aiOrganize,
    aiOrganizeAll,
    applyAiPlan,
    aiSuggestName,
    saveAi,
    testAi,
  };
}
