import { useMemo, useState, useRef, type ReactNode } from 'react';
import { useDialog } from '../hooks/useDialog';
import type { Context, TabRecord } from '@/shared/types';
import { contextToMarkdown, contextToJSON } from '@/shared/export';
import { downloadText, sanitizeFilename } from '../util';
import { useT } from '../i18n';

/** 把我们生成的简单 Markdown 渲染为可读元素(标题 + 可点链接)。 */
function renderMarkdown(md: string): ReactNode {
  return md
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line, i) => {
      if (line.startsWith('## ')) {
        return (
          <div key={i} className="font-semibold text-[13px] mb-1">
            {line.slice(3)}
          </div>
        );
      }
      const m = line.match(/^- \[(.*)\]\((.*)\)$/);
      if (m) {
        return (
          <div key={i} className="flex items-baseline gap-1.5 py-0.5">
            <span className="opacity-30 shrink-0">•</span>
            <a
              href={m[2]}
              target="_blank"
              rel="noreferrer"
              title={m[2]}
              className="text-accent hover:underline truncate"
            >
              {m[1]}
            </a>
          </div>
        );
      }
      return (
        <div key={i} className="opacity-70">
          {line}
        </div>
      );
    });
}

interface Props {
  context: Context;
  tabs: TabRecord[]; // 已按 tabOrder 排好
  exportedAt: number;
  onFlash: (msg: string) => void;
  onClose: () => void;
}

export function ExportDialog({ context, tabs, exportedAt, onFlash, onClose }: Props) {
  const { t } = useT();
  const [format, setFormat] = useState<'md' | 'json'>('md');
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef, onClose);
  const md = useMemo(() => contextToMarkdown(context, tabs), [context, tabs]);
  const json = useMemo(() => contextToJSON(context, tabs, exportedAt), [context, tabs, exportedAt]);
  const content = format === 'md' ? md : json;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      onFlash(t('export.copied'));
    } catch {
      onFlash(t('export.copyFailed'));
    }
  };
  const download = () => {
    const ext = format === 'md' ? 'md' : 'json';
    const mime = format === 'md' ? 'text/markdown' : 'application/json';
    downloadText(`${sanitizeFilename(context.name)}.${ext}`, content, mime);
    onFlash(t('export.downloaded'));
  };

  const tab = (f: 'md' | 'json', label: string) => (
    <button
      onClick={() => setFormat(f)}
      className={`px-2 py-0.5 rounded text-[12px] ${
        format === f ? 'bg-accent/15 text-accent' : 'opacity-60 hover:opacity-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="absolute inset-0 z-30 flex justify-center bg-black/30" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('export.ariaLabel')}
        tabIndex={-1}
        className="mt-6 w-[92%] max-h-[82%] flex flex-col rounded-xl overflow-hidden shadow-2xl
                   bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-black/10 dark:border-white/10">
          <span className="text-[12px] opacity-70 flex-1 truncate">
            {t('export.title', { name: context.name })}
          </span>
          {tab('md', 'Markdown')}
          {tab('json', 'JSON')}
        </div>

        {format === 'md' ? (
          <div className="flex-1 overflow-auto px-3 py-2 text-[12px]">{renderMarkdown(md)}</div>
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="px-3 pt-2 text-[11px] opacity-45">{t('export.jsonNote')}</div>
            <pre className="px-3 py-2 text-[11.5px] leading-relaxed font-mono whitespace-pre-wrap break-words">
              {json}
            </pre>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-black/10 dark:border-white/10">
          <button
            onClick={onClose}
            aria-label={t('export.close')}
            className="px-2.5 py-1 rounded-md text-[12px] opacity-60 hover:opacity-100"
          >
            {t('export.close')}
          </button>
          <button
            onClick={download}
            aria-label={t('export.download')}
            className="px-2.5 py-1 rounded-md text-[12px] opacity-70 hover:opacity-100
                       hover:bg-black/5 dark:hover:bg-white/10"
          >
            {t('export.download')}
          </button>
          <button
            onClick={copy}
            aria-label={t('export.copy')}
            className="px-2.5 py-1 rounded-md text-[12px] bg-accent text-white hover:opacity-90"
          >
            {t('export.copy')}
          </button>
        </div>
      </div>
    </div>
  );
}
