import { useMemo, useState } from 'react';
import type { Context, TabRecord } from '@/shared/types';
import { contextToMarkdown, contextToJSON } from '@/shared/export';
import { downloadText, sanitizeFilename } from '../util';

interface Props {
  context: Context;
  tabs: TabRecord[]; // 已按 tabOrder 排好
  exportedAt: number;
  onFlash: (msg: string) => void;
  onClose: () => void;
}

export function ExportDialog({ context, tabs, exportedAt, onFlash, onClose }: Props) {
  const [format, setFormat] = useState<'md' | 'json'>('md');
  const md = useMemo(() => contextToMarkdown(context, tabs), [context, tabs]);
  const json = useMemo(() => contextToJSON(context, tabs, exportedAt), [context, tabs, exportedAt]);
  const content = format === 'md' ? md : json;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      onFlash('已复制到剪贴板');
    } catch {
      onFlash('复制失败,请重试');
    }
  };
  const download = () => {
    const ext = format === 'md' ? 'md' : 'json';
    const mime = format === 'md' ? 'text/markdown' : 'application/json';
    downloadText(`${sanitizeFilename(context.name)}.${ext}`, content, mime);
    onFlash('已下载文件');
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
        className="mt-6 w-[92%] max-h-[82%] flex flex-col rounded-xl overflow-hidden shadow-2xl
                   bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-black/10 dark:border-white/10">
          <span className="text-[12px] opacity-70 flex-1 truncate">导出 · {context.name}</span>
          {tab('md', 'Markdown')}
          {tab('json', 'JSON')}
        </div>

        <pre className="flex-1 overflow-auto px-3 py-2 text-[11.5px] leading-relaxed font-mono whitespace-pre-wrap break-all">
          {content}
        </pre>

        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-black/10 dark:border-white/10">
          <button onClick={onClose} className="px-2.5 py-1 rounded-md text-[12px] opacity-60 hover:opacity-100">
            关闭
          </button>
          <button
            onClick={download}
            className="px-2.5 py-1 rounded-md text-[12px] opacity-70 hover:opacity-100
                       hover:bg-black/5 dark:hover:bg-white/10"
          >
            下载文件
          </button>
          <button
            onClick={copy}
            className="px-2.5 py-1 rounded-md text-[12px] bg-accent text-white hover:opacity-90"
          >
            复制
          </button>
        </div>
      </div>
    </div>
  );
}
