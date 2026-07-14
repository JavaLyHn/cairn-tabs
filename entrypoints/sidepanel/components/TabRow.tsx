import type { TabRecord } from '@/shared/types';
import { hostname } from '../util';
import { localhostPort, projectFor } from '@/shared/localhost';
import { parseGitHub, badgeLabel, repoSlug, cleanGitHubTitle } from '@/shared/github';

// GitHub PR / Issue 图标(Octicons,12px)
function PrIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
    </svg>
  );
}
function IssueIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
    </svg>
  );
}

interface Props {
  tab: TabRecord;
  dupState?: 'keeper' | 'redundant';
  portMap: Record<number, string>;
  ageLabel?: string; // 陈旧簇里显示「N 天前」
  onActivate: () => void;
  onClose: () => void;
}

// 休眠(已挂起)标记
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
    </svg>
  );
}

export function TabRow({ tab, dupState, portMap, ageLabel, onActivate, onClose }: Props) {
  const port = localhostPort(tab.url);
  const project = port != null ? projectFor(tab.url, portMap) : null;
  const gh = project == null ? parseGitHub(tab.url) : null; // localhost 优先,其余尝试 GitHub
  const displayTitle = project ?? (gh ? cleanGitHubTitle(tab.title, gh) : tab.title);
  const asleep = tab.discarded === true;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/cairn-tab-record', tab.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onActivate}
      className="group/row flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer
                 hover:bg-black/5 dark:hover:bg-white/5 select-none"
      title={asleep ? `已休眠 · 点击重新加载\n${tab.url}` : tab.url}
    >
      {tab.faviconUrl ? (
        <img src={tab.faviconUrl} alt="" className={`w-4 h-4 shrink-0 ${asleep ? 'grayscale opacity-50' : ''}`} />
      ) : (
        <div className="w-4 h-4 shrink-0 rounded-sm bg-black/10 dark:bg-white/10" />
      )}
      <span className={`flex-1 truncate ${asleep ? 'opacity-55' : ''}`}>{displayTitle}</span>
      {asleep && (
        <span
          className="shrink-0 inline-flex items-center gap-1 font-mono text-[10.5px] opacity-45"
          title="已休眠 · 点击重新加载"
        >
          <MoonIcon />
          休眠
        </span>
      )}
      {gh && (
        <span
          className="shrink-0 inline-flex items-center gap-1 font-mono text-[11px]
                     px-1 py-0.5 rounded bg-accent/15 text-accent"
          title={`${gh.kind === 'pr' ? 'Pull Request' : 'Issue'} #${gh.number} · ${repoSlug(gh)}`}
        >
          {gh.kind === 'pr' ? <PrIcon /> : <IssueIcon />}
          {badgeLabel(gh)}
        </span>
      )}
      {port != null && (
        <span className="font-mono text-[11px] opacity-45 shrink-0" title={tab.title}>
          :{port}
        </span>
      )}
      {dupState === 'redundant' && (
        <span
          className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-500"
          title="重复标签(合并时会被关闭)"
        >
          重复
        </span>
      )}
      {dupState === 'keeper' && (
        <span
          className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-accent/15 text-accent"
          title="重复组中最新打开的,合并时保留这个"
        >
          重复·留
        </span>
      )}
      {ageLabel && (
        <span className="font-mono text-[11px] opacity-40 shrink-0">{ageLabel}</span>
      )}
      <span className="hidden group-hover/row:inline font-mono text-[11px] opacity-40 shrink-0">
        {gh ? repoSlug(gh) : hostname(tab.url)}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="hidden group-hover/row:flex items-center justify-center w-4 h-4 shrink-0
                   rounded opacity-50 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
        title="关闭标签"
      >
        ×
      </button>
    </div>
  );
}
