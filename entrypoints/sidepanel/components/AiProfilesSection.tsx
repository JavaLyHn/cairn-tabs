import { useState } from 'react';
import type { AIProviderId, AIStatus } from '@/shared/ai';
import { useT } from '../i18n';

const PROVIDER_LABELS: Record<AIProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  custom: 'custom',
};

type SaveInput = {
  id?: string;
  label: string;
  provider: AIProviderId;
  model: string;
  baseUrl?: string;
  key?: string;
};

interface Props {
  ai: AIStatus;
  onSave: (input: SaveInput) => Promise<string | undefined>;
  onDelete: (id: string) => Promise<void>;
  onActivate: (id: string) => Promise<void>;
  onTest: () => Promise<{ ok: boolean; detail: string }>;
}

// null = 看列表;否则在编辑器(id 有值=编辑现有,无=新增)
type Editing = {
  id?: string;
  provider: AIProviderId;
  label: string;
  model: string;
  baseUrl: string;
} | null;

export function AiProfilesSection({ ai, onSave, onDelete, onActivate, onTest }: Props) {
  const { t } = useT();
  const [editing, setEditing] = useState<Editing>(null);

  const providerLabel = (p: AIProviderId) =>
    p === 'custom' ? t('settings.ai.provider.custom') : PROVIDER_LABELS[p];

  const activeProfile = ai.profiles.find((p) => p.id === ai.activeId) ?? null;

  if (editing) {
    return (
      <ProfileEditor
        editing={editing}
        setEditing={setEditing}
        isNew={editing.id === undefined}
        onSave={onSave}
        onTest={onTest}
      />
    );
  }

  return (
    <div className="px-3 py-2.5">
      <div className="text-[11px] opacity-50 leading-snug mb-2">{t('settings.ai.desc')}</div>

      {activeProfile && (
        <div className="text-[11px] text-accent mb-2">
          {t('settings.ai.current', { label: activeProfile.label, model: activeProfile.model })}
        </div>
      )}

      {ai.profiles.length === 0 ? (
        <div className="text-[11px] opacity-45 leading-snug mb-2">
          {t('settings.ai.profiles.empty')}
        </div>
      ) : (
        <div className="space-y-1 mb-2">
          {ai.profiles.map((p) => {
            const isActive = p.id === ai.activeId;
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded border border-black/10 dark:border-white/10"
              >
                <button
                  onClick={() => !isActive && onActivate(p.id)}
                  title={
                    isActive ? t('settings.ai.activeBadge') : t('settings.ai.actions.setActive')
                  }
                  aria-label={
                    isActive ? t('settings.ai.activeBadge') : t('settings.ai.actions.setActive')
                  }
                  className={`shrink-0 w-2.5 h-2.5 rounded-full border ${
                    isActive
                      ? 'bg-accent border-accent'
                      : 'border-black/30 dark:border-white/30 hover:border-accent'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] font-medium truncate">{p.label}</span>
                    {isActive && (
                      <span className="shrink-0 text-[9.5px] px-1 py-px rounded-full bg-accent/15 text-accent">
                        {t('settings.ai.activeBadge')}
                      </span>
                    )}
                  </div>
                  <div className="text-[10.5px] opacity-50 truncate font-mono">
                    {providerLabel(p.provider)} · {p.model}
                    {!p.hasKey && ' · (no key)'}
                  </div>
                </div>
                <button
                  onClick={() =>
                    setEditing({
                      id: p.id,
                      provider: p.provider,
                      label: p.label,
                      model: p.model,
                      baseUrl: p.baseUrl ?? '',
                    })
                  }
                  className="shrink-0 text-[11px] opacity-60 hover:opacity-100"
                >
                  {t('settings.ai.actions.edit')}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(t('settings.ai.deleteConfirm', { label: p.label })))
                      onDelete(p.id);
                  }}
                  className="shrink-0 text-[11px] opacity-60 hover:opacity-100 hover:text-red-500"
                >
                  {t('settings.ai.actions.delete')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setEditing({ provider: 'anthropic', label: '', model: '', baseUrl: '' })}
        className="text-[12px] text-accent hover:opacity-80"
      >
        {t('settings.ai.profiles.add')}
      </button>
    </div>
  );
}

function ProfileEditor({
  editing,
  setEditing,
  isNew,
  onSave,
  onTest,
}: {
  editing: NonNullable<Editing>;
  setEditing: (e: Editing) => void;
  isNew: boolean;
  onSave: (input: SaveInput) => Promise<string | undefined>;
  onTest: () => Promise<{ ok: boolean; detail: string }>;
}) {
  const { t } = useT();
  // 首次保存(可能由「测试连接」触发)后记住返回的 id,后续保存即「改这一份」——
  // 否则 测试→保存 会创建两条一样的配置。
  const [profileId, setProfileId] = useState(editing.id);
  const [provider, setProvider] = useState<AIProviderId>(editing.provider);
  const [label, setLabel] = useState(editing.label);
  const [key, setKey] = useState('');
  const [model, setModel] = useState(editing.model);
  const [baseUrl, setBaseUrl] = useState(editing.baseUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const isCustom = provider === 'custom';
  const needsUrl = isCustom && !baseUrl.trim();
  // 首次(新建)必须有 key;编辑时留空表示不改
  const canSave = !needsUrl && (!!key.trim() || !isNew);

  const providerLabel = (p: AIProviderId) =>
    p === 'custom' ? t('settings.ai.provider.custom') : PROVIDER_LABELS[p];

  const input = (): SaveInput => ({
    id: profileId,
    label,
    provider,
    model,
    baseUrl: isCustom ? baseUrl : undefined,
    key: key.trim() ? key : undefined,
  });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const id = await onSave(input());
      if (id) setProfileId(id);
      setEditing(null);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : t('settings.ai.saveFailed'), ok: false });
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (canSave) {
        const id = await onSave(input()); // 先存(含权限申请)再测当前份
        if (id) setProfileId(id); // 记住 id:随后点「保存」是改这一份,不再新建
      }
      const r = await onTest();
      setMsg({ text: r.detail, ok: r.ok });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : t('settings.ai.testFailed'), ok: false });
    }
    setBusy(false);
  };

  const field =
    'w-full px-2.5 py-1.5 text-[12px] rounded-md border border-black/15 dark:border-white/15 bg-transparent outline-none focus:border-accent focus:ring-1 focus:ring-accent/30';
  const fieldLabel = 'block text-[10px] uppercase tracking-wide opacity-45 mb-1';
  const btn = 'px-3 py-1.5 rounded-md text-[12px] whitespace-nowrap shrink-0 disabled:opacity-40';

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12.5px] font-medium">
          {isNew ? t('settings.ai.newTitle') : t('settings.ai.editTitle')}
        </span>
        <button
          onClick={() => setEditing(null)}
          className="text-[11px] opacity-60 hover:opacity-100"
        >
          {t('settings.ai.backToList')}
        </button>
      </div>

      {/* 服务商分段控件 */}
      <div className="inline-flex gap-0.5 mb-3 p-0.5 rounded-lg bg-black/[0.06] dark:bg-white/[0.06]">
        {(['anthropic', 'openai', 'custom'] as AIProviderId[]).map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={`px-2.5 py-1 rounded-md text-[12px] whitespace-nowrap transition-colors ${
              provider === p
                ? 'bg-white dark:bg-neutral-700 text-accent font-medium shadow-sm'
                : 'opacity-55 hover:opacity-90'
            }`}
          >
            {providerLabel(p)}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        <div>
          <span className={fieldLabel}>{t('settings.ai.field.label')}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('settings.ai.label.placeholder')}
            aria-label={t('settings.ai.label.placeholder')}
            autoComplete="off"
            className={field}
          />
        </div>

        {isCustom && (
          <div>
            <span className={fieldLabel}>{t('settings.ai.field.baseUrl')}</span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={t('settings.ai.baseUrl.placeholder')}
              aria-label={t('settings.ai.baseUrl.placeholder')}
              autoComplete="off"
              spellCheck={false}
              className={`${field} font-mono`}
            />
            <p className="text-[10.5px] opacity-45 leading-snug mt-1">
              {t('settings.ai.baseUrl.warning')}
            </p>
          </div>
        )}

        <div>
          <span className={fieldLabel}>{t('settings.ai.field.key')}</span>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              isNew
                ? t('settings.ai.key.placeholder.new', { provider: providerLabel(provider) })
                : t('settings.ai.key.placeholder.saved')
            }
            aria-label="API key"
            autoComplete="new-password"
            className={field}
          />
        </div>

        <div>
          <span className={fieldLabel}>{t('settings.ai.field.model')}</span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={
              isCustom
                ? t('settings.ai.model.placeholder.custom')
                : t('settings.ai.model.placeholder.default')
            }
            aria-label={
              isCustom
                ? t('settings.ai.model.placeholder.custom')
                : t('settings.ai.model.placeholder.default')
            }
            autoComplete="off"
            spellCheck={false}
            className={`${field} font-mono`}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3.5">
        <button
          onClick={save}
          disabled={busy || !canSave}
          className={`${btn} bg-accent text-white hover:opacity-90`}
        >
          {t('settings.ai.save')}
        </button>
        <button
          onClick={test}
          disabled={busy || !canSave}
          className={`${btn} border border-black/15 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10`}
        >
          {t('settings.ai.test')}
        </button>
      </div>
      {msg && (
        <p
          className={`mt-2 text-[11px] leading-snug ${
            msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
