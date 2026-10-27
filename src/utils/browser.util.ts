/**
 * 品牌资源
 *
 * 全浏览器统一使用 logo_girl 系列（按尺寸预生成），不再按浏览器分流。
 */

/** 品牌 Logo（所有浏览器统一） */
export const GIRL_LOGO = '/image/logo/logo_girl-256.png';

/**
 * 取当前品牌 Logo。
 *
 * 全浏览器统一返回 logo_girl，保留函数是为了集中管理 Logo 路径，
 * 后续替换品牌资源时只需改这一处。
 */
export function getBrandLogo(): string {
    return GIRL_LOGO;
}
