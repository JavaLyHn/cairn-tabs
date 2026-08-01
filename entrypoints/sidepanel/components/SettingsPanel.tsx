import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useDialog } from '../hooks/useDialog';
import { useT, type MessageKey } from '../i18n';
import { SUPPORTED, LOCALE_NAMES, type Locale } from '../i18n/locales';
import { useTheme } from '../theme';
import {
  ACCENTS,
  accentPresetId,
  resolveAccentHex,
  isValidHex,
  type ThemeMode,
} from '../theme/theme';
import { APP_NAME, AUTHOR, appVersion } from '@/shared/meta';
import type { Flags } from '@/shared/types';
import type { AIProviderId, AIStatus } from '@/shared/ai';
import { AiProfilesSection } from './AiProfilesSection';

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
  onSaveProfile: (input: {
    id?: string;
    label: string;
    provider: AIProviderId;
    model: string;
    baseUrl?: string;
    key?: string;
  }) => Promise<string | undefined>;
  onDeleteProfile: (id: string) => Promise<void>;
  onActivateProfile: (id: string) => Promise<void>;
  onTestAi: () => Promise<{ ok: boolean; detail: string }>;
  onExportAll: () => void;
  onImport: (file: File) => void;
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
          aria-label={`${title} −`}
          className="w-6 h-6 rounded-md text-[13px] leading-none border border-black/15 dark:border-white/20
                     hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
        >
          −
        </button>
        <span className="w-5 text-center font-mono text-[12.5px]">{value}</span>
        <button
          onClick={() => set(value + step)}
          disabled={value >= max}
          aria-label={`${title} +`}
          className="w-6 h-6 rounded-md text-[13px] leading-none border border-black/15 dark:border-white/20
                     hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

/** 外观:主题模式分段控件 + 强调色预设/自定义。纯 UI 偏好(chrome.storage.local),即时全局生效。 */
function AppearanceSection() {
  const { t } = useT();
  const { mode, accent, setMode, setAccent } = useTheme();
  const selectedPreset = accentPresetId(accent);
  const currentHex = resolveAccentHex(accent);
  const [hexDraft, setHexDraft] = useState(currentHex);
  useEffect(() => setHexDraft(currentHex), [currentHex]);

  const modes: ThemeMode[] = ['auto', 'light', 'dark'];
  const modeLabel: Record<ThemeMode, string> = {
    auto: t('settings.appearance.theme.auto'),
    light: t('settings.appearance.theme.light'),
    dark: t('settings.appearance.theme.dark'),
  };
  const accentName = (id: string) => t(`settings.appearance.accent.name.${id}` as MessageKey);
  // <input type=color> 只认 #rrggbb:把 #rgb 展开,其余原样
  const sixHex = (h: string) =>
    /^#[0-9a-f]{3}$/i.test(h) ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
  const onHexInput = (v: string) => {
    setHexDraft(v);
    if (isValidHex(v)) setAccent(v.trim().toLowerCase());
  };

  return (
    <>
      {/* 主题模式 */}
      <div className="px-3 py-2.5">
        <div className="text-[12.5px]">{t('settings.appearance.theme.title')}</div>
        <div className="text-[11px] opacity-50 leading-snug mt-0.5">
          {t('settings.appearance.theme.desc')}
        </div>
        <div className="inline-flex mt-2 rounded-lg p-0.5 gap-0.5 bg-black/[0.06] dark:bg-white/[0.08]">
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`px-3 py-1 rounded-md text-[12px] ${
                mode === m
                  ? 'bg-white dark:bg-neutral-700 shadow-sm font-medium'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              {modeLabel[m]}
            </button>
          ))}
        </div>
      </div>

      {/* 强调色 */}
      <div className="px-3 py-2.5 bg-black/[0.02] dark:bg-white/[0.03]">
        <div className="text-[12.5px]">{t('settings.appearance.accent.title')}</div>
        <div className="text-[11px] opacity-50 leading-snug mt-0.5">
          {t('settings.appearance.accent.desc')}
        </div>
        <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
          {ACCENTS.map((a) => {
            const on = selectedPreset === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setAccent(a.id)}
                aria-label={accentName(a.id)}
                aria-pressed={on}
                title={accentName(a.id)}
                className={`relative w-6 h-6 rounded-full transition-transform hover:scale-110
                            ring-offset-2 ring-offset-white dark:ring-offset-neutral-900
                            ${on ? 'ring-2 ring-black/40 dark:ring-white/50' : ''}`}
                style={{ backgroundColor: a.hex }}
              >
                {on && (
                  <span className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-white shadow" />
                )}
              </button>
            );
          })}
        </div>

        {/* 自定义 hex */}
        <div className="flex items-center gap-2 mt-3">
          <input
            type="color"
            value={sixHex(currentHex)}
            onChange={(e) => setAccent(e.target.value)}
            aria-label={t('settings.appearance.accent.customAria')}
            className="w-7 h-7 shrink-0 rounded-md cursor-pointer bg-transparent p-0
                       border border-black/15 dark:border-white/20"
          />
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => onHexInput(e.target.value)}
            spellCheck={false}
            placeholder="#1d9e75"
            aria-label={t('settings.appearance.accent.customAria')}
            className="w-24 px-2 py-1 text-[12px] font-mono rounded bg-transparent outline-none
                       border border-black/15 dark:border-white/20 focus:border-accent"
          />
          <span className={`text-[11px] ${selectedPreset === null ? 'text-accent' : 'opacity-45'}`}>
            {t('settings.appearance.accent.custom')}
          </span>
        </div>
      </div>
    </>
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
  onSaveProfile,
  onDeleteProfile,
  onActivateProfile,
  onTestAi,
  onExportAll,
  onImport,
  onClose,
}: Props) {
  const { t, locale, setLocale } = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  useDialog(panelRef, onClose);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.ariaLabel')}
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
        <span className="flex-1 text-[13px] font-medium">{t('settings.title')}</span>
        <button
          onClick={onClose}
          className="px-2 py-1 rounded-md text-[12px] text-accent hover:bg-black/5 dark:hover:bg-white/10"
          title={t('settings.doneTitle')}
          aria-label={t('settings.doneTitle')}
        >
          {t('settings.done')}
        </button>
      </header>

      {/* 可滚动内容:分组卡片,铺满整幅宽度 */}
      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        <Group title={t('settings.group.appearance')}>
          <AppearanceSection />
        </Group>
        <Group title={t('settings.group.language')}>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[13px]">{t('settings.group.language')}</span>
            <select
              aria-label={t('settings.group.language')}
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="text-[12px] bg-transparent border border-black/15 dark:border-white/20 rounded-md px-2 py-1 outline-none focus-visible:border-accent"
            >
              {SUPPORTED.map((loc) => (
                <option key={loc} value={loc}>
                  {LOCALE_NAMES[loc]}
                </option>
              ))}
            </select>
          </div>
        </Group>
        <Group title={t('settings.group.autoCluster')}>
          <ToggleRow
            title={t('settings.autoCluster.title')}
            desc={t('settings.autoCluster.desc')}
            on={flags.autoCluster}
            onToggle={() => onToggleAutoCluster(!flags.autoCluster)}
          />
          {flags.autoCluster && (
            <StepperRow
              nested
              title={t('settings.autoCluster.domainSize.title')}
              desc={t('settings.autoCluster.domainSize.desc')}
              value={flags.sameDomainPromoteSize}
              min={2}
              max={8}
              onChange={onSetSameDomainSize}
            />
          )}
        </Group>

        <Group title={t('settings.group.stale')}>
          <ToggleRow
            title={t('settings.stale.hints.title')}
            desc={t('settings.stale.hints.desc')}
            on={flags.staleHints}
            onToggle={() => onToggleStaleHints(!flags.staleHints)}
          />
          {flags.staleHints && (
            <StepperRow
              nested
              title={t('settings.stale.days.title')}
              desc={t('settings.stale.days.desc')}
              value={flags.staleDays}
              min={1}
              max={90}
              onChange={onSetStaleDays}
            />
          )}
        </Group>

        <Group title={t('settings.group.memory')}>
          <ToggleRow
            title={t('settings.memory.autoDiscard.title')}
            desc={t('settings.memory.autoDiscard.desc')}
            on={flags.autoDiscard}
            onToggle={() => onToggleAutoDiscard(!flags.autoDiscard)}
          />
          {flags.autoDiscard && (
            <>
              <StepperRow
                nested
                title={t('settings.memory.discardMinutes.title')}
                desc={t('settings.memory.discardMinutes.desc')}
                value={flags.discardAfterMinutes}
                min={5}
                max={480}
                step={5}
                onChange={onSetDiscardAfterMinutes}
              />
              <ToggleRow
                nested
                title={t('settings.memory.discardSkipsLocalhost.title')}
                desc={t('settings.memory.discardSkipsLocalhost.desc')}
                on={flags.discardSkipsLocalhost}
                onToggle={() => onToggleDiscardSkipsLocalhost(!flags.discardSkipsLocalhost)}
              />
            </>
          )}
        </Group>

        <Group title={t('settings.group.ai')}>
          <AiProfilesSection
            ai={ai}
            onSave={onSaveProfile}
            onDelete={onDeleteProfile}
            onActivate={onActivateProfile}
            onTest={onTestAi}
          />
        </Group>

        <Group title={t('settings.group.data')}>
          <button
            onClick={onExportAll}
            className="w-full text-left px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <div className="text-[12.5px]">{t('settings.data.exportAll.title')}</div>
            <div className="text-[11px] opacity-50 leading-snug mt-0.5">
              {t('settings.data.exportAll.desc')}
            </div>
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="w-full text-left px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <div className="text-[12.5px]">{t('settings.data.import')}</div>
            <div className="text-[11px] opacity-50 leading-snug mt-0.5">
              {t('settings.data.importDesc')}
            </div>
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label={t('settings.data.import')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file);
              e.target.value = ''; // 允许再次选同一文件
            }}
          />
        </Group>

        {/* 关于:当前版本 + 署名(版本供用户自查更新是否生效) */}
        <div className="px-3 pt-1 text-center text-[10.5px] opacity-40 select-none">
          {APP_NAME} v{appVersion()} · © {AUTHOR} · AGPL-3.0
        </div>
      </div>
    </div>
  );
}
