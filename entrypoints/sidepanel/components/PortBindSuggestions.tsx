import { useState } from 'react';

interface Suggestion {
  port: number;
  name: string;
}

interface Props {
  suggestions: Suggestion[];
  onBind: (port: number, project: string) => void;
  onIgnore: (port: number) => void;
}

function SuggestionRow({
  port,
  name,
  onBind,
  onIgnore,
}: {
  port: number;
  name: string;
  onBind: (project: string) => void;
  onIgnore: () => void;
}) {
  const [value, setValue] = useState(name);
  return (
    <div className="flex items-center gap-2 px-1 py-0.5 text-[12px]">
      <span className="opacity-60">绑定</span>
      <span className="font-mono text-[11px] opacity-70 shrink-0">:{port}</span>
      <span className="opacity-40">→</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onBind(value);
        }}
        className="flex-1 min-w-0 bg-transparent border-b border-accent/40 outline-none"
      />
      <button onClick={() => onBind(value)} className="shrink-0 text-accent text-[11px] hover:underline">
        绑定
      </button>
      <button onClick={onIgnore} className="shrink-0 opacity-40 hover:opacity-80 text-[11px]">
        忽略
      </button>
    </div>
  );
}

export function PortBindSuggestions({ suggestions, onBind, onIgnore }: Props) {
  if (suggestions.length === 0) return null;
  return (
    <div className="px-2 py-1 border-b border-black/10 dark:border-white/10 bg-accent/[0.06]">
      {suggestions.map((s) => (
        <SuggestionRow
          key={s.port}
          port={s.port}
          name={s.name}
          onBind={(project) => onBind(s.port, project)}
          onIgnore={() => onIgnore(s.port)}
        />
      ))}
    </div>
  );
}
