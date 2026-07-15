// AI 请求运行器:管理在飞请求的 AbortController,支持超时与用户取消,
// 并把「用户取消」与「超时/网络失败」区分开(两者在 fetch 层都是 AbortError)。
// 取消意图挂在每次调用自己的 controller 上(而非共享标记),
// 避免后一次请求把前一次的取消意图清掉(见回归测试)。

import { AICancelledError } from '@/shared/ai';

type TaggedController = AbortController & { userCancelled?: boolean };

export interface AiRunner {
  /** 跑一次请求:doRequest 收到 signal;超时 timeoutMs 后自动 abort。 */
  run(doRequest: (signal: AbortSignal) => Promise<string>, timeoutMs: number): Promise<string>;
  /** 用户主动取消当前在飞请求 → 该请求以 AICancelledError 拒绝。 */
  cancel(): void;
}

export function createAiRunner(): AiRunner {
  let current: TaggedController | null = null;
  return {
    run(doRequest, timeoutMs) {
      current?.abort(); // 只允许一个在飞,防串
      const ctrl: TaggedController = new AbortController();
      current = ctrl;
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      return doRequest(ctrl.signal)
        .catch((e) => {
          if (ctrl.userCancelled) throw new AICancelledError(); // 用户取消 → 可区分标记
          throw e; // 超时/网络失败 → 原样上抛(命令层归为 network)
        })
        .finally(() => {
          clearTimeout(timer);
          if (current === ctrl) current = null; // 只清自己那次,避免误清后一次请求
        });
    },
    cancel() {
      if (current) {
        current.userCancelled = true;
        current.abort();
      }
    },
  };
}
