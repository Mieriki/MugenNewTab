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

/** 壁纸降采样的最长边上限（px） */
export const MAX_WALLPAPER_EDGE = 2560;

/**
 * 壁纸输入文件的大小兜底上限：50MB
 *
 * 这不是存储配额，只是避免用户误选超大文件时把内存打爆；
 * 文件会先降采样再落盘，通常压缩后不到 1MB。
 */
export const MAX_WALLPAPER_INPUT_BYTES = 50 * 1024 * 1024;

/** 壁纸重编码质量 */
const WALLPAPER_QUALITY = 0.9;

/** 解码后的图片源 */
interface DecodedImage {
    source: CanvasImageSource;
    width: number;
    height: number;
    dispose: () => void;
}

/** 把 Blob 读成 Data URL */
function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('图片编码失败'));
        reader.readAsDataURL(blob);
    });
}

/**
 * 解码图片文件
 *
 * 优先 createImageBitmap，失败回退到 object URL + <img>；
 * 两者都不可用（如 jsdom、部分 SVG）时返回 null，由调用方回退到原图。
 */
async function decodeImage(file: File): Promise<DecodedImage | null> {
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file);
            return {
                source: bitmap,
                width: bitmap.width,
                height: bitmap.height,
                dispose: () => bitmap.close()
            };
        } catch {
            // 继续尝试 <img> 解码
        }
    }

    if (typeof document === 'undefined' || typeof Image === 'undefined') {
        return null;
    }

    let objectUrl: string | null = null;
    try {
        objectUrl = URL.createObjectURL(file);
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片解码失败'));
            img.src = objectUrl as string;
        });
        return {
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            dispose: () => URL.revokeObjectURL(objectUrl as string)
        };
    } catch {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
        return null;
    }
}

/** 创建画布，优先 OffscreenCanvas，不可用时回退到 <canvas> */
function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas | null {
    if (typeof OffscreenCanvas !== 'undefined') {
        try {
            return new OffscreenCanvas(width, height);
        } catch {
            // 继续回退
        }
    }
    if (typeof document === 'undefined') {
        return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

/** 把画布编码为指定 MIME 的 Blob */
async function encodeCanvas(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    type: string
): Promise<Blob | null> {
    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
        try {
            return await canvas.convertToBlob({ type, quality: WALLPAPER_QUALITY });
        } catch {
            return null;
        }
    }
    const element = canvas as HTMLCanvasElement;
    return new Promise<Blob | null>(resolve => {
        element.toBlob(blob => resolve(blob), type, WALLPAPER_QUALITY);
    });
}

/**
 * 压缩图片文件供壁纸使用
 *
 * 等比缩放到最长边不超过 MAX_WALLPAPER_EDGE，再重新编码（WebP 优先，回退 JPEG）。
 * 以下情况直接返回原图，保证不阻断用户操作：
 *   - 图片无法解码（jsdom、SVG 等）
 *   - 编码失败
 *   - 压缩结果反而更大（原图本来就很小）
 *
 * @returns dataUrl 可直接用于 CSS background-image；bytes 为落盘后的实际字节数
 */
export async function compressImageFile(
    file: File
): Promise<{ dataUrl: string; bytes: number; type: string }> {
    const fallback = async () => ({
        dataUrl: await fileToBase64(file),
        bytes: file.size,
        type: file.type || 'image/png'
    });

    const decoded = await decodeImage(file);
    if (!decoded) {
        return fallback();
    }

    try {
        const scale = Math.min(1, MAX_WALLPAPER_EDGE / Math.max(decoded.width, decoded.height));
        const width = Math.max(1, Math.round(decoded.width * scale));
        const height = Math.max(1, Math.round(decoded.height * scale));

        const canvas = createCanvas(width, height);
        if (!canvas) {
            return fallback();
        }
        const context = (canvas as HTMLCanvasElement).getContext('2d');
        if (!context) {
            return fallback();
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(decoded.source, 0, 0, width, height);

        let blob = await encodeCanvas(canvas, 'image/webp');
        // WebP 不被支持时浏览器会静默退回 PNG，这里再明确要一次 JPEG
        if (!blob || blob.type !== 'image/webp') {
            blob = await encodeCanvas(canvas, 'image/jpeg');
        }
        if (!blob || blob.size >= file.size) {
            return fallback();
        }

        return {
            dataUrl: await blobToDataUrl(blob),
            bytes: blob.size,
            type: blob.type || 'image/jpeg'
        };
    } catch {
        return fallback();
    } finally {
        decoded.dispose();
    }
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
