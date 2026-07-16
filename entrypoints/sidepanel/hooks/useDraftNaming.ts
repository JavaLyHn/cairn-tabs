import { useState } from 'react';
import { dispatch } from '../store';
import type { Context } from '@/shared/types';

/**
 * 管理「新建草稿」与「改名」的本地状态:
 *   - editingId  当前正在改名的簇 id
 *   - draftId    刚新建、尚未确认的草稿簇 id
 *   - createContext 新建一个「新任务」草稿并自动进入改名
 *   - commitName    失焦提交(有效名则改名,定稿草稿)
 *   - cancelEdit    Esc 取消(空草稿直接删除)
 */
export function useDraftNaming(): {
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  draftId: string | null;
  createContext: () => Promise<void>;
  commitName: (c: Context, value: string) => void;
  cancelEdit: (c: Context) => void;
} {
  // 正在改名的簇 id(受控:新建后自动进入、双击或点「改名」进入)
  const [editingId, setEditingId] = useState<string | null>(null);
  // 刚新建、尚未确认的草稿簇 id(Esc 时无标签则删除)
  const [draftId, setDraftId] = useState<string | null>(null);

  /** 至多一个「新任务」草稿:SW 复用已存在的,返回其 id;新建后直接进入改名。 */
  const createContext = async (): Promise<void> => {
    const ev = await dispatch({ type: 'CREATE_CONTEXT', name: '新任务' });
    if (ev?.type === 'CONTEXT_CREATED') {
      setDraftId(ev.contextId);
      setEditingId(ev.contextId);
    }
  };

  /** 结束改名(失焦):有效命名则改名。空的「新任务」草稿失焦时保留(可拖标签进来 / 改名 / × 删),
   *  不再自动删除——否则点别处准备拖标签时草稿就没了,拖不进去。放弃请用 Esc 或 ×。 */
  const commitName = (c: Context, value: string): void => {
    const name = value.trim();
    const meaningful = name !== '' && name !== '新任务';
    if (meaningful) dispatch({ type: 'RENAME_CONTEXT', contextId: c.id, name });
    if (draftId === c.id) setDraftId(null); // 失焦即定稿,不再当空草稿删除
    setEditingId(null);
  };

  /** Esc 取消:空草稿直接删除,否则仅退出编辑。 */
  const cancelEdit = (c: Context): void => {
    if (draftId === c.id && c.tabOrder.length === 0) {
      dispatch({ type: 'DELETE_CONTEXT', contextId: c.id });
      setDraftId(null);
    }
    setEditingId(null);
  };

  return { editingId, setEditingId, draftId, createContext, commitName, cancelEdit };
}
