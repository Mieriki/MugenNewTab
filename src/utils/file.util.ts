/**
 * 文件处理工具
 * 与原项目 js/app.js 中 FileReader、WallpaperManager.fileToBase64 行为一致
 */

/** 默认允许的最大文件大小：5MB */
export const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * 将文件读取为 Base64 Data URL
 * @param file 待读取文件
 */
export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

/**
 * 读取文本文件内容
 * @param file 待读取文件
 */
export function readTextFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsText(file);
    });
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) {
        return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

/**
 * 校验文件大小是否超过限制
 * @param file 待校验文件
 * @param maxSize 最大字节数（默认 5MB）
 */
export function validateFileSize(file: File, maxSize = DEFAULT_MAX_FILE_SIZE): boolean {
    return file.size <= maxSize;
}

/**
 * 校验文件类型是否为图片
 * @param file 待校验文件
 */
export function isImageFile(file: File): boolean {
    return file.type.startsWith('image/');
}

/**
 * 校验文件类型是否为 JSON
 * @param file 待校验文件
 */
export function isJsonFile(file: File): boolean {
    return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
}
