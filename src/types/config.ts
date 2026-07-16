/**
 * 配置相关类型定义
 * 对应 public/config/themes.json、public/config/searchEngines.json、public/config/defaultData.json
 */

import type { AppNavigatorData } from './app';
import type { UiLib, UserUiLib } from './ui';

/** 单个主题配色配置 */
export interface Theme {
    id: string;
    name: string;
    description: string;
    logo: string;
    /** 是否为深色主题 */
    isDark?: boolean;
    /** Material Design 3 颜色变量映射 */
    colors: Record<string, string>;
}

/** 主题总配置 */
export interface ThemeConfig {
    defaultTheme: string;
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
