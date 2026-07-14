import { useState } from 'react';
import type { Flags } from '@/shared/types';
import type { AIProviderId, AIStatus } from '@/shared/ai';

interface Props {
  flags: Flags;
  ai: AIStatus;
  onToggleAutoCluster: (enabled: boolean) => void;
  onToggleStaleHints: (enabled: boolean) => void;
  onToggleAutoDiscard: (enabled: boolean) => void;
  onToggleDiscardSkipsLocalhost: (enabled: boolean) => void;
  onSaveAi: (
    provider: AIProviderId,
    key: string | undefined,
    model: string,
    baseUrl?: string,
  ) => Promise<void>;
  onTestAi: () => Promise<{ ok: boolean; detail: string }>;
  onExportAll: () => void;
  onClose: () => void;
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors
                  ${on ? 'bg-accent' : 'bg-black/20 dark:bg-white/25'}`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full bg-white transition-transform
                    ${on ? 'translate-x-3.5' : 'translate-x-0.5'}`}
      />
    </span>
  );
}

function ToggleRow({
  title,
  desc,
  on,
  onToggle,
}: {
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5"
    >
      <div className="flex-1">
        <div className="text-[12.5px]">{title}</div>
        <div className="text-[11px] opacity-50 leading-snug mt-0.5">{desc}</div>
      </div>
      <div className="pt-0.5">
        <Toggle on={on} />
      </div>
    </button>
  );
}

export function SettingsPanel({
  flags,
  ai,
  onToggleAutoCluster,
  onToggleStaleHints,
  onToggleAutoDiscard,
  onToggleDiscardSkipsLocalhost,
  onSaveAi,
  onTestAi,
  onExportAll,
  onClose,
}: Props) {
  return (
    <div className="absolute inset-0 z-30" onClick={onClose}>
      <div
        className="absolute right-2 top-1 w-72 max-h-[90%] overflow-y-auto rounded-lg shadow-xl
                   bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 text-[11px] uppercase tracking-wide opacity-40 border-b border-black/10 dark:border-white/10">
          设置
        </div>

        <ToggleRow
          title="自动聚簇"
          desc="自动把相关新标签归入任务、并在标签栏建组。关闭后新标签只进「未分类」,由你手动整理。"
          on={flags.autoCluster}
          onToggle={() => onToggleAutoCluster(!flags.autoCluster)}
        />

        <div className="border-t border-black/10 dark:border-white/10">
          <ToggleRow
            title={`陈旧提示 · ${flags.staleDays} 天`}
            desc="超过阈值天数未访问的标签下沉到底部,给一个「全部归档」入口。只展示,不主动动你的标签。"
            on={flags.staleHints}
            onToggle={() => onToggleStaleHints(!flags.staleHints)}
          />
        </div>

        <div className="border-t border-black/10 dark:border-white/10">
          <ToggleRow
            title={`自动挂起 · ${flags.discardAfterMinutes} 分钟`}
            desc="闲置超过阈值的标签释放内存(标签保留,点击自动重载)。默认关闭 —— 想省内存再打开。"
            on={flags.autoDiscard}
            onToggle={() => onToggleAutoDiscard(!flags.autoDiscard)}
          />
          {flags.autoDiscard && (
            <div className="border-t border-black/5 dark:border-white/5">
              <ToggleRow
                title="localhost 不挂起"
                desc="保护 dev server 页面 —— 本地开发地址永不被自动挂起,避免丢失页面状态。"
                on={flags.discardSkipsLocalhost}
                onToggle={() => onToggleDiscardSkipsLocalhost(!flags.discardSkipsLocalhost)}
              />
            </div>
          )}
        </div>

        <div className="border-t border-black/10 dark:border-white/10">
          <AISection ai={ai} onSave={onSaveAi} onTest={onTestAi} />
        </div>

        <div className="border-t border-black/10 dark:border-white/10">
          <button
            onClick={onExportAll}
            className="w-full text-left px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <div className="text-[12.5px]">导出全部数据 (JSON)</div>
            <div className="text-[11px] opacity-50 leading-snug mt-0.5">
              下载所有任务与标签的备份文件,用于迁移或存档。
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

const PROVIDER_LABELS: Record<AIProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  custom: '自定义中转站',
};

function AISection({
  ai,
  onSave,
  onTest,
}: {
  ai: AIStatus;
  onSave: (
    provider: AIProviderId,
    key: string | undefined,
    model: string,
    baseUrl?: string,
  ) => Promise<void>;
  onTest: () => Promise<{ ok: boolean; detail: string }>;
}) {
  const [provider, setProvider] = useState<AIProviderId>(ai.provider);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const isCustom = provider === 'custom';
  const needsUrl = isCustom && !baseUrl.trim();
  // 当前查看的这一档已存有可用配置(key 已存;custom 还需已存 baseUrl)
  const savedHere = ai.hasKey && ai.provider === provider;
  // 可保存:已填 key(首次配置),或本档已保存过(改模型/地址时 key 留空即不改);custom 需有 URL
  const canSave = !needsUrl && (!!key.trim() || savedHere);
  // 可测:能保存(先存再测),或本档已保存(直接测已存配置)。
  // 不能在切到另一档、什么都没填时直接测——否则测的是「已保存的那一档」,结果会误导。
  const canTest = canSave || savedHere;

  // key 留空 → 传 undefined 表示「不改动已存的 key」(避免误删);填了才发新值。
  const keyArg = () => (key.trim() ? key : undefined);

  const save = async () => {
    setSaving(true);
    setMsg('');
    setResult(null);
    try {
      await onSave(provider, keyArg(), model, isCustom ? baseUrl : undefined);
      setKey('');
      setMsg('已保存');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存失败');
    }
    setSaving(false);
  };

  const test = async () => {
    setTesting(true);
    setMsg('');
    setResult(null);
    try {
      // 先把当前表单存下(key 留空则保留已存的),再测——含权限申请
      if (canSave) {
        await onSave(provider, keyArg(), model, isCustom ? baseUrl : undefined);
        setKey('');
      }
      setResult(await onTest());
    } catch (e) {
      setResult({ ok: false, detail: e instanceof Error ? e.message : '测试失败' });
    }
    setTesting(false);
  };

  const busy = saving || testing;

  return (
    <div className="px-3 py-2.5">
      <div className="text-[12.5px] mb-1">AI 整理(BYO Key)</div>
      <div className="text-[11px] opacity-50 leading-snug mb-2">
        默认关闭。开启后仅把标签标题+域名+任务名发给你选的服务商,用你的 key 直连,绝不发完整网址/页面内容。
        {ai.hasKey && (
          <span className="text-accent"> 当前:{PROVIDER_LABELS[ai.provider]} 已配置。</span>
        )}
      </div>
      <div className="flex gap-1 mb-1.5">
        {(['anthropic', 'openai', 'custom'] as AIProviderId[]).map((p) => (
          <button
            key={p}
            onClick={() => {
              setProvider(p);
              setResult(null);
              setMsg('');
            }}
            className={`px-2 py-0.5 rounded text-[12px] ${
              provider === p ? 'bg-accent/15 text-accent' : 'opacity-60 hover:opacity-100'
            }`}
          >
            {PROVIDER_LABELS[p]}
          </button>
        ))}
      </div>
      {isCustom && (
        <>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="接口地址,如 https://newapi.elevatesphere.com/v1"
            className="w-full mb-1.5 px-2 py-1 text-[12px] rounded border border-black/15 dark:border-white/15
                       bg-transparent outline-none focus:border-accent font-mono"
          />
          <div className="text-[11px] opacity-45 leading-snug mb-1.5">
            OpenAI 兼容中转站。中转站是第三方,数据会经过它——请填你信任的地址。
          </div>
        </>
      )}
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={savedHere ? '•••••••••••• · 已保存(留空则不改)' : `${PROVIDER_LABELS[provider]} API key`}
        className="w-full mb-1.5 px-2 py-1 text-[12px] rounded border border-black/15 dark:border-white/15
                   bg-transparent outline-none focus:border-accent"
      />
      <input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder={isCustom ? '模型,如 gpt-4o / claude-3-5-sonnet' : '模型(留空用默认)'}
        className="w-full mb-1.5 px-2 py-1 text-[12px] rounded border border-black/15 dark:border-white/15
                   bg-transparent outline-none focus:border-accent font-mono"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy || !canSave}
          className="px-2.5 py-1 rounded-md text-[12px] bg-accent text-white hover:opacity-90 disabled:opacity-40"
        >
          保存并启用
        </button>
        <button
          onClick={test}
          disabled={busy || !canTest}
          className="px-2.5 py-1 rounded-md text-[12px] border border-black/15 dark:border-white/20
                     hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
        >
          {testing ? '测试中…' : '测试连接'}
        </button>
        {msg && <span className="text-[11px] opacity-60">{msg}</span>}
      </div>
      {result && (
        <div
          className={`mt-1.5 text-[11px] leading-snug ${
            result.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {result.ok ? '✓ ' : '✗ '}
          {result.detail}
        </div>
      )}
    </div>
  );
}
