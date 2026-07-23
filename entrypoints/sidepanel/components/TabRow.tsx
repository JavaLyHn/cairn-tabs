import type { TabRecord } from '@/shared/types';
import { hostname } from '../util';
import { Favicon } from './Favicon';
import { localhostPort, projectFor } from '@/shared/localhost';
import { parseGitHub, badgeLabel, repoSlug, cleanGitHubTitle } from '@/shared/github';
import {
  parseBitbucket,
  bitbucketBadgeLabel,
  bitbucketRepoSlug,
  cleanBitbucketTitle,
} from '@/shared/bitbucket';
import { useT } from '../i18n';

// GitHub PR / Issue 图标(Octicons,12px)
function PrIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
    </svg>
  );
}
function IssueIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
    >
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
  unclearReason?: string; // AI 整理拿不准、留原位 → 显示小标记 + 悬停理由
  onActivate: () => void;
  onClose: () => void;
  closeTitle?: string; // 覆盖 × 按钮的提示/无障碍文案(默认「关闭」;重点区用「移出重点」)
  onToggleStar?: () => void; // 提供则显示重点标注星按钮
}

// 重点标注(star)图标:filled=已加星
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

// 休眠(已挂起)标记
function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
    </svg>
  );
}

export function TabRow({
  tab,
  dupState,
  portMap,
  ageLabel,
  unclearReason,
  onActivate,
  onClose,
  closeTitle,
  onToggleStar,
}: Props) {
  const { t } = useT();
  const port = localhostPort(tab.url);
  const project = port != null ? projectFor(tab.url, portMap) : null;
  const gh = project == null ? parseGitHub(tab.url) : null; // localhost 优先,其余尝试 GitHub
  const bb = project == null && !gh ? parseBitbucket(tab.url) : null;
  const codeRef = gh
    ? { kind: gh.kind, label: badgeLabel(gh), slug: repoSlug(gh), number: gh.number }
    : bb
      ? {
          kind: bb.kind,
          label: bitbucketBadgeLabel(bb),
          slug: bitbucketRepoSlug(bb),
          number: bb.number,
        }
      : null;
  const displayTitle =
    project ??
    (gh ? cleanGitHubTitle(tab.title, gh) : bb ? cleanBitbucketTitle(tab.title, bb) : tab.title);
  const asleep = tab.discarded === true;
  return (
    <div
      draggable
      tabIndex={0}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/cairn-tab-record', tab.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onActivate();
      }}
      className="group/row flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer
                 hover:bg-black/5 dark:hover:bg-white/5 select-none"
      title={asleep ? t('tabRow.asleepFullTitle', { url: tab.url }) : tab.url}
    >
      <Favicon url={tab.url} title={tab.title} faviconUrl={tab.faviconUrl} asleep={asleep} />
      <span className={`flex-1 truncate ${asleep ? 'opacity-55' : ''}`}>{displayTitle}</span>
      {unclearReason !== undefined && (
        <span
          className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-medium
                     bg-amber-500/15 text-amber-600 dark:text-amber-500"
          title={
            unclearReason
              ? t('tabRow.unclear', { reason: unclearReason })
              : t('tabRow.unclearGeneric')
          }
          aria-label={
            unclearReason
              ? t('tabRow.unclear', { reason: unclearReason })
              : t('tabRow.unclearGeneric')
          }
        >
          ?
        </span>
      )}
      {asleep && (
        <span
          className="shrink-0 inline-flex items-center gap-1 font-mono text-[10.5px] opacity-45"
          title={t('tabRow.asleepTitle')}
        >
          <MoonIcon />
          {t('tabRow.asleep')}
        </span>
      )}
      {codeRef && (
        <span
          className="shrink-0 inline-flex items-center gap-1 font-mono text-[11px]
                     px-1 py-0.5 rounded bg-accent/15 text-accent"
          title={`${codeRef.kind === 'pr' ? 'Pull Request' : 'Issue'} #${codeRef.number} · ${codeRef.slug}`}
        >
          {codeRef.kind === 'pr' ? <PrIcon /> : <IssueIcon />}
          {codeRef.label}
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
          title={t('tabRow.duplicateTitle')}
        >
          {t('tabRow.duplicate')}
        </span>
      )}
      {dupState === 'keeper' && (
        <span
          className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-accent/15 text-accent"
          title={t('tabRow.duplicateKeepTitle')}
        >
          {t('tabRow.duplicateKeep')}
        </span>
      )}
      {ageLabel && <span className="font-mono text-[11px] opacity-40 shrink-0">{ageLabel}</span>}
      <span className="hidden group-hover/row:inline group-focus-within/row:inline font-mono text-[11px] opacity-40 shrink-0">
        {codeRef ? codeRef.slug : hostname(tab.url)}
      </span>
      {onToggleStar && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          className={`shrink-0 items-center justify-center w-4 h-4 rounded ${
            tab.starred
              ? 'flex text-amber-400 hover:text-amber-500'
              : 'hidden group-hover/row:flex group-focus-within/row:flex opacity-45 hover:opacity-90'
          }`}
          title={tab.starred ? t('tabRow.unstar') : t('tabRow.star')}
          aria-label={tab.starred ? t('tabRow.unstar') : t('tabRow.star')}
        >
          <StarIcon filled={tab.starred === true} />
        </button>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="hidden group-hover/row:flex group-focus-within/row:flex items-center justify-center w-4 h-4 shrink-0
                   rounded opacity-50 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
        title={closeTitle ?? t('tabRow.close')}
        aria-label={closeTitle ?? t('tabRow.close')}
      >
        ×
      </button>
    </div>
  );
}
