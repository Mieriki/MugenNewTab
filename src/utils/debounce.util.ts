/**
 * 防抖与节流工具
 * 与原项目 js/app.js 中 Utils.debounce、Utils.throttle 行为一致
 */

/** 防抖函数类型 */
export interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
    (...args: Parameters<T>): void;
    /** 取消待执行的调用 */
    cancel(): void;
}

/** 节流函数类型 */
export interface ThrottledFunction<T extends (...args: unknown[]) => unknown> {
    (...args: Parameters<T>): void;
}

/**
 * 防抖函数
 * @param fn 原始函数
 * @param delay 延迟毫秒数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): DebouncedFunction<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const debounced = (...args: Parameters<T>): void => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            fn(...args);
            timer = null;
        }, delay);
    };

    debounced.cancel = (): void => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    return debounced;
}

/**
 * 节流函数
 * @param fn 原始函数
 * @param limit 限制毫秒数
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
    fn: T,
    limit: number
): ThrottledFunction<T> {
    let inThrottle = false;

    return (...args: Parameters<T>): void => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
            }, limit);
        }
    };
}
