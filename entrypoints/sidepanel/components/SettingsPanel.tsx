import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useDialog } from '../hooks/useDialog';
import type { Flags } from '@/shared/types';
import type { AIProviderId, AIStatus } from '@/shared/ai';

interface Props {
  flags: Flags;
  ai: AIStatus;
  onToggleAutoCluster: (enabled: boolean) => void;
  onSetSameDomainSize: (size: number) => void;
  onToggleStaleHints: (enabled: boolean) => void;
  onSetStaleDays: (days: number) => void;
  onToggleAutoDiscard: (enabled: boolean) => void;
  onSetDiscardAfterMinutes: (minutes: number) => void;
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

/** 分组:小标题 + 圆角卡片。卡片内各行用 divide 分隔,行自带 px/py。 */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-3">
      <div className="px-1 pb-1.5 text-[11px] uppercase tracking-wide opacity-40">{title}</div>
      <div
        className="rounded-xl overflow-hidden bg-black/[0.03] dark:bg-white/[0.05]
                   border border-black/5 dark:border-white/10
                   divide-y divide-black/5 dark:divide-white/10"
      >
        {children}
      </div>
    </section>
  );
}

function ToggleRow({
  title,
  desc,
  on,
  onToggle,
  nested,
}: {
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
  nested?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-start gap-2 px-3 py-2.5 text-left
                  hover:bg-black/5 dark:hover:bg-white/5
                  ${nested ? 'bg-black/[0.02] dark:bg-white/[0.03]' : ''}`}
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

function StepperRow({
  title,
  desc,
  value,
  min,
  max,
  step = 1,
  onChange,
  nested,
}: {
  title: string;
  desc: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  nested?: boolean;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div
      className={`flex items-start gap-2 px-3 py-2.5 ${
        nested ? 'bg-black/[0.02] dark:bg-white/[0.03]' : ''
      }`}
    >
      <div className="flex-1">
        <div className="text-[12.5px]">{title}</div>
        <div className="text-[11px] opacity-50 leading-snug mt-0.5">{desc}</div>
      </div>
      <div className="flex items-center gap-1 pt-0.5 shrink-0">
        <button
          onClick={() => set(value - step)}
          disabled={value <= min}
          className="w-6 h-6 rounded-md text-[13px] leading-none border border-black/15 dark:border-white/20
                     hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
        >
          −
        </button>
        <span className="w-5 text-center font-mono text-[12.5px]">{value}</span>
        <button
          onClick={() => set(value + step)}
          disabled={value >= max}
          className="w-6 h-6 rounded-md text-[13px] leading-none border border-black/15 dark:border-white/20
                     hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function SettingsPanel({
  flags,
  ai,
  onToggleAutoCluster,
  onSetSameDomainSize,
  onToggleStaleHints,
  onSetStaleDays,
  onToggleAutoDiscard,
  onSetDiscardAfterMinutes,
  onToggleDiscardSkipsLocalhost,
  onSaveAi,
  onTestAi,
  onExportAll,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef, onClose);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      tabIndex={-1}
      className="settings-sheet absolute inset-0 z-30 flex flex-col bg-white dark:bg-neutral-900"
    >
      {/* 固定标题栏 */}
      <header className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-black/10 dark:border-white/10">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-55 shrink-0"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span className="flex-1 text-[13px] font-medium">设置</span>
        <button
          onClick={onClose}
          className="px-2 py-1 rounded-md text-[12px] text-accent hover:bg-black/5 dark:hover:bg-white/10"
          title="完成 (Esc)"
        >
          完成
        </button>
      </header>

      {/* 可滚动内容:分组卡片,铺满整幅宽度 */}
      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        <Group title="自动归类">
          <ToggleRow
            title="自动归类"
            desc="把相关新标签自动归入任务,并在标签栏建立对应分组。关闭后新标签只进「未分类」,由你手动整理。"
            on={flags.autoCluster}
            onToggle={() => onToggleAutoCluster(!flags.autoCluster)}
          />
          {flags.autoCluster && (
            <StepperRow
              nested
              title="同站归类建议"
              desc="未分类里同一网站的标签达到这个数,就建议归成一个任务(你确认才生效)。"
              value={flags.sameDomainPromoteSize}
              min={2}
              max={8}
              onChange={onSetSameDomainSize}
            />
          )}
        </Group>

        <Group title="陈旧标签">
          <ToggleRow
            title="陈旧提示"
            desc="很久没访问的标签下沉到底部,给一个「全部归档」入口;只提示,不动你的标签。"
            on={flags.staleHints}
            onToggle={() => onToggleStaleHints(!flags.staleHints)}
          />
          {flags.staleHints && (
            <StepperRow
              nested
              title="陈旧阈值 · 天"
              desc="超过这么多天没访问就算陈旧(重点标签除外)。"
              value={flags.staleDays}
              min={1}
              max={90}
              onChange={onSetStaleDays}
            />
          )}
        </Group>

        <Group title="内存">
          <ToggleRow
            title="自动休眠"
            desc="很久没用的标签自动释放内存,标签保留、点击自动重载;默认关闭,想省内存再开。"
            on={flags.autoDiscard}
            onToggle={() => onToggleAutoDiscard(!flags.autoDiscard)}
          />
          {flags.autoDiscard && (
            <>
              <StepperRow
                nested
                title="休眠阈值 · 分钟"
                desc="超过这么多分钟没用就释放内存(重点标签、localhost 除外)。"
                value={flags.discardAfterMinutes}
                min={5}
                max={480}
                step={5}
                onChange={onSetDiscardAfterMinutes}
              />
              <ToggleRow
                nested
                title="localhost 不休眠"
                desc="本地开发地址永不自动休眠,保护 dev server 的页面状态。"
                on={flags.discardSkipsLocalhost}
                onToggle={() => onToggleDiscardSkipsLocalhost(!flags.discardSkipsLocalhost)}
              />
            </>
          )}
        </Group>

        <Group title="AI 整理">
          <AISection ai={ai} onSave={onSaveAi} onTest={onTestAi} />
        </Group>

        <Group title="数据">
          <button
            onClick={onExportAll}
            className="w-full text-left px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <div className="text-[12.5px]">导出全部数据 (JSON)</div>
            <div className="text-[11px] opacity-50 leading-snug mt-0.5">
              导出所有任务与标签,用于备份或迁移。
            </div>
          </button>
        </Group>
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
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 成功提示约 2.5s 自动消失;失败保留(方便看清)。切档/再次保存或测试时照旧清除。
  const showMsg = (text: string, ok: boolean) => {
    if (msgTimer.current) clearTimeout(msgTimer.current);
    setMsg({ text, ok });
    if (ok) msgTimer.current = setTimeout(() => setMsg(null), 2500);
  };
  useEffect(
    () => () => {
      if (msgTimer.current) clearTimeout(msgTimer.current);
    },
    [],
  );
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
    setMsg(null);
    setResult(null);
    try {
      await onSave(provider, keyArg(), model, isCustom ? baseUrl : undefined);
      setKey('');
      showMsg('已保存', true);
    } catch (e) {
      showMsg(e instanceof Error ? e.message : '保存失败', false);
    }
    setSaving(false);
  };

  const test = async () => {
    setTesting(true);
    setMsg(null);
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
      <div className="text-[11px] opacity-50 leading-snug mb-2">
        自带 API key,用你的 key
        直连你选的服务商。默认关闭。只把标签标题、域名、任务名发出去,绝不发完整网址或页面内容。
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
              setMsg(null);
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
            OpenAI 兼容的中转站。它是第三方,数据会经过它,请填你信任的地址。
          </div>
        </>
      )}
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={
          savedHere ? '•••••••••••• · 已保存(留空则不改)' : `${PROVIDER_LABELS[provider]} API key`
        }
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
        {msg && (
          <span
            className={`text-[11px] ${
              msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {msg.text}
          </span>
        )}
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
