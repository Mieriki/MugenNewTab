/**
 * 配置相关类型定义
 * 对应 public/config/themes.json、public/config/searchEngines.json、public/config/defaultData.json
 */

import type { AppNavigatorData } from './app';
import type { UiLib, UserUiLib } from './ui';

/** 主题模式：明亮 / 深色 */
export type ThemeMode = 'light' | 'dark';

/**
 * 单个主题配色配置
 *
 * 每套主题现在都有明/暗两个变体，二者共享同一个 `family`（主题族）。
 * 选择器按族展示，模式由独立的明/暗开关决定，实际生效的是「族 + 模式」对应的变体。
 */
export interface Theme {
    id: string;
    /** 主题族 ID（同一族的明/暗变体相同）；旧配置缺失时按 id 兜底 */
    family?: string;
    /** 明/暗模式；旧配置缺失时按 isDark 推断 */
    mode?: ThemeMode;
    name: string;
    description: string;
    logo: string;
    /** 是否为深色主题（保留用于兼容旧配置，新配置与 mode 一致） */
    isDark?: boolean;
    /** Material Design 3 颜色变量映射 */
    colors: Record<string, string>;
}

/** 主题族：一组同色系、仅明暗不同的变体 */
export interface ThemeFamily {
    id: string;
    name: string;
    description: string;
    logo: string;
    /** 明亮变体 */
    light?: Theme;
    /** 深色变体 */
    dark?: Theme;
}

/** 主题总配置 */
export interface ThemeConfig {
    defaultTheme: string;
    /** 旧主题 ID → 新变体 ID 的迁移表（老用户升级后保持原有配色） */
    legacyIds?: Record<string, string>;
    themes: Theme[];
}

/** 搜索引擎配置项 */
export interface SearchEngine {
    name: string;
    /** 搜索 URL 模板，使用 {q} 作为查询占位符 */
    url: string;
    icon: string;
}

/** 默认数据总配置 */
export interface DefaultDataConfig {
    appNavigator: AppNavigatorData;
    systemUiLib: UiLib;
    userUiLib: UserUiLib;
}

/** 配置加载器返回类型 */
export type ConfigName = 'themes' | 'searchEngines' | 'defaultData';

/** 主题派生变量集合（ThemeManager 动态计算） */
export interface DerivedThemeVariables {
    '--md-primary': string;
    '--md-primary-dark': string;
    '--md-primary-light': string;
    '--md-primary-container': string;
    '--md-secondary': string;
    '--md-secondary-container': string;
    '--md-background': string;
    '--md-surface': string;
    '--md-surface-variant': string;
    '--md-surface-2': string;
    '--md-on-primary': string;
    '--md-on-background': string;
    '--md-on-surface': string;
    '--md-outline': string;
    '--md-shadow': string;
}
