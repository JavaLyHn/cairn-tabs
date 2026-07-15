// 聚簇引擎与 SW/存储的接线(见 PRD §6)。纯逻辑在 core/clustering,这里负责读写。

import type { Repository } from '../store/repositories';
import { assignContext } from '../clustering/engine';
import type { Penalties } from '../clustering/rules';

/** 为新标签(未被原生分组归属的)用打分引擎选簇。 */
export async function resolveNewTabContext(
  repo: Repository,
  penalties: Penalties,
  opts: { url: string; openerRecordId?: string; now: number },
): Promise<string> {
  const { contexts, tabs } = await repo.getSnapshot();
  return assignContext({
    url: opts.url,
    openerRecordId: opts.openerRecordId,
    now: opts.now,
    contexts,
    tabs,
    penalties,
  });
}
