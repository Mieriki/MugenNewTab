/**
 * 链接跳转工具
 *
 * 统一「点击站点卡片 / 执行搜索」时的跳转行为，由 layout store 的 openMode 决定：
 *   - new-tab：window.open(url, '_blank')，当前新标签页保留；
 *   - current-tab：location.assign(url)，用目标站点覆盖当前新标签页。
 *
 * 为什么用 assign 而不是 replace：
 * assign 会留下一条历史记录，用户在目标站点按「后退」能回到新标签页；
 * replace 会把新标签页从历史里抹掉，误点之后无法回退，体验更差。
 */

import type { LinkOpenMode } from '@/types/storage';

export type { LinkOpenMode };

/** 默认跳转方式：新标签页（与历史行为一致） */
export const DEFAULT_OPEN_MODE: LinkOpenMode = 'new-tab';

/** 运行时校验：只接受已知的两种取值，其余一律视为默认值 */
export function isLinkOpenMode(value: unknown): value is LinkOpenMode {
    return value === 'new-tab' || value === 'current-tab';
}

/**
 * 按指定方式打开链接
 *
 * @param url  目标地址，空串直接忽略（避免把新标签页导航到空白页）
 * @param mode 跳转方式，缺省为新标签页
 */
export function openUrl(url: string, mode: LinkOpenMode = DEFAULT_OPEN_MODE): void {
    const target = (url ?? '').trim();
    if (!target) return;

    if (mode === 'current-tab') {
        window.location.assign(target);
        return;
    }

    window.open(target, '_blank');
}
