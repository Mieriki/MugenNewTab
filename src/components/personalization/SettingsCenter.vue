<script setup lang="ts">
/**
 * SettingsCenter - 统一设置中心
 *
 * 形态对齐参考设计：整高弹窗，左侧「分组 + 图标文字」导航，右侧是
 * 「分组标题 + 卡片 + 行」的设置内容。所有设置项收敛到这里，
 * FAB 菜单与极简模式的控制区只是带上 tab 参数打开本组件。
 *
 * 新增设置页只需在 NAV_ITEMS 注册一项并补一个 v-show 区块。
 */
import { computed, ref, watch } from 'vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import ThemeSelector from '@/components/personalization/ThemeSelector.vue';
import WallpaperSettings from '@/components/personalization/WallpaperSettings.vue';
import LayoutSettings from '@/components/personalization/LayoutSettings.vue';
import CardStyleSettings from '@/components/personalization/CardStyleSettings.vue';
import CacheSettings from '@/components/personalization/CacheSettings.vue';
import CloudSyncPanel from '@/components/personalization/CloudSyncPanel.vue';
import DataTransferPanel from '@/components/personalization/DataTransferPanel.vue';
import AboutPanel from '@/components/personalization/AboutPanel.vue';

/** 设置栏目 ID */
export type SettingsTabId = 'appearance' | 'wallpaper' | 'layout' | 'card' | 'data' | 'about';

interface NavItem {
    id: SettingsTabId;
    label: string;
    icon: string;
    /** 导航里的分组归属 */
    group: string;
}

export interface SettingsCenterProps {
    /** 是否显示，支持 v-model */
    modelValue: boolean;
    /** 打开时定位到的栏目 */
    tab?: SettingsTabId;
    /** 子面板是否自动初始化对应 store */
    autoInit?: boolean;
}

const props = withDefaults(defineProps<SettingsCenterProps>(), {
    tab: 'appearance',
    autoInit: true
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'update:tab', value: SettingsTabId): void;
    (e: 'close'): void;
    /** 导出数据（业务逻辑在 App.vue，这里只转发意图） */
    (e: 'export-data'): void;
    /** 导入数据 */
    (e: 'import-data'): void;
}>();

/** 栏目注册表：分组顺序即导航渲染顺序 */
const NAV_ITEMS: NavItem[] = [
    { id: 'appearance', label: '外观', icon: 'palette', group: '通用' },
    { id: 'wallpaper', label: '壁纸', icon: 'picture', group: '通用' },
    { id: 'layout', label: '页面布局', icon: 'sort', group: '通用' },
    { id: 'card', label: '卡片样式', icon: 'filter', group: '通用' },
    { id: 'data', label: '数据与同步', icon: 'cloud', group: '数据' },
    { id: 'about', label: '关于', icon: 'info', group: '数据' },
];

/** 按 group 聚合，渲染成「分组标题 + 条目」 */
const navGroups = computed(() => {
    const groups = new Map<string, NavItem[]>();
    for (const item of NAV_ITEMS) {
        const list = groups.get(item.group);
        if (list) {
            list.push(item);
        } else {
            groups.set(item.group, [item]);
        }
    }
    return Array.from(groups, ([name, items]) => ({ name, items }));
});

const activeTab = ref<SettingsTabId>(props.tab);

// 外部改 tab（例如 FAB 点「云同步」）时同步激活项
watch(
    () => props.tab,
    (next) => {
        if (next && next !== activeTab.value) {
            activeTab.value = next;
        }
    }
);

const isOpen = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
});

function selectTab(id: SettingsTabId): void {
    activeTab.value = id;
    emit('update:tab', id);
}

function close(): void {
    isOpen.value = false;
    emit('close');
}

function handleOverlayClick(): void {
    close();
}

function handleEsc(event: KeyboardEvent): void {
    if (event.key === 'Escape' && isOpen.value) {
        event.preventDefault();
        close();
    }
}
</script>

<template>
    <Teleport to="body">
        <Transition name="settings-center">
            <div
                v-if="isOpen"
                class="settings-center-wrapper"
                @keydown="handleEsc"
            >
                <div
                    class="settings-center-overlay"
                    aria-hidden="true"
                    @click="handleOverlayClick"
                />

                <div
                    class="settings-center"
                    role="dialog"
                    aria-modal="true"
                    aria-label="设置"
                    tabindex="-1"
                >
                    <aside class="settings-nav" aria-label="设置栏目">
                        <h2 class="settings-nav__title">设置</h2>

                        <div
                            v-for="group in navGroups"
                            :key="group.name"
                            class="settings-nav__group"
                        >
                            <p class="settings-nav__group-title">{{ group.name }}</p>
                            <button
                                v-for="item in group.items"
                                :key="item.id"
                                type="button"
                                class="settings-nav__item"
                                :class="{ active: activeTab === item.id }"
                                :aria-current="activeTab === item.id ? 'page' : undefined"
                                @click="selectTab(item.id)"
                            >
                                <IconSvg :name="item.icon" :size="16" monochrome />
                                <span>{{ item.label }}</span>
                            </button>
                        </div>
                    </aside>

                    <section class="settings-panel">
                        <header class="settings-panel__header">
                            <h3 class="settings-panel__title">
                                {{ NAV_ITEMS.find((item) => item.id === activeTab)?.label }}
                            </h3>
                            <button
                                type="button"
                                class="settings-panel__close"
                                aria-label="关闭设置"
                                @click="close"
                            >
                                <IconSvg name="close" :size="18" monochrome />
                            </button>
                        </header>

                        <div class="settings-panel__body">
                            <div v-show="activeTab === 'appearance'" class="settings-panel__tab">
                                <ThemeSelector :auto-init="autoInit" />
                            </div>
                            <div v-show="activeTab === 'wallpaper'" class="settings-panel__tab">
                                <WallpaperSettings :auto-init="autoInit" />
                            </div>
                            <div v-show="activeTab === 'layout'" class="settings-panel__tab">
                                <LayoutSettings />
                            </div>
                            <div v-show="activeTab === 'card'" class="settings-panel__tab">
                                <CardStyleSettings />
                            </div>
                            <div v-show="activeTab === 'data'" class="settings-panel__tab">
                                <CloudSyncPanel />
                                <DataTransferPanel
                                    @export-data="emit('export-data')"
                                    @import-data="emit('import-data')"
                                />
                                <CacheSettings />
                            </div>
                            <div v-show="activeTab === 'about'" class="settings-panel__tab">
                                <AboutPanel />
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.settings-center-wrapper {
    position: fixed;
    inset: 0;
    z-index: 1001;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none;
}

.settings-center-overlay {
    position: fixed;
    inset: 0;
    background: rgba(12, 10, 9, 0.4);
    backdrop-filter: blur(4px);
    pointer-events: auto;
}

.settings-center {
    position: relative;
    display: flex;
    width: min(880px, calc(100vw - 48px));
    height: min(720px, calc(100vh - 64px));
    max-height: calc(100vh - 64px);
    overflow: hidden;
    pointer-events: auto;
    // 浮层：中性面板底 + 发丝描边 + 大投影
    @include ui-floating(3, var(--ui-radius-xl));
}

// ==================== 左侧导航 ====================
.settings-nav {
    flex: 0 0 216px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--ui-space-4) var(--ui-space-3);
    // 导航底色比内容区深一档，靠右侧发丝描边分隔
    background: color-mix(in srgb, var(--ui-panel) 60%, var(--ui-sunken));
    border-right: 1px solid var(--ui-hairline);
    overflow-y: auto;
    @include hide-scrollbar;

    &__title {
        margin: 0 0 var(--ui-space-3);
        padding: 0 var(--ui-space-2);
        font-size: var(--ui-font-title);
        font-weight: 600;
        color: var(--ui-ink);
        letter-spacing: var(--ui-track-tight);
    }

    &__group {
        display: flex;
        flex-direction: column;
        gap: 2px;

        & + & {
            margin-top: var(--ui-space-3);
        }
    }

    &__group-title {
        @include ui-caption;
        padding: var(--ui-space-1) var(--ui-space-2);
        font-size: var(--ui-font-micro);
        color: var(--ui-muted-soft);
    }

    &__item {
        @include button-reset;
        display: flex;
        align-items: center;
        gap: var(--ui-space-2);
        min-height: 34px;
        padding: 0 var(--ui-space-2);
        border-radius: var(--ui-radius-md);
        font-size: var(--ui-font-small);
        font-weight: 500;
        color: var(--ui-muted);
        @include ui-interactive;
        @include ui-focus-ring;

        // 选中：中性浅底 + 实色文字，主色只留给图标
        &.active {
            background: var(--ui-elevated);
            color: var(--ui-ink);
            box-shadow: inset 0 0 0 1px var(--ui-hairline);

            :deep(.icon-svg) {
                color: var(--ui-accent);
            }
        }
    }
}

// ==================== 右侧内容 ====================
.settings-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--ui-canvas);

    &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ui-space-3);
        padding: var(--ui-space-4) var(--ui-space-5);
        border-bottom: 1px solid var(--ui-hairline);
        flex-shrink: 0;
    }

    &__title {
        margin: 0;
        font-size: var(--ui-font-title);
        font-weight: 600;
        color: var(--ui-ink);
        letter-spacing: var(--ui-track-tight);
    }

    &__close {
        @include button-reset;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--ui-radius-md);
        color: var(--ui-muted);
        @include ui-transition(background-color, color);
        @include ui-focus-ring;

        &:hover {
            background: var(--ui-elevated-hover);
            color: var(--ui-ink);
        }
    }

    &__body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--ui-space-5);
        @include hide-scrollbar;
    }

    // 栏目内部：多个分组之间统一留白
    &__tab {
        display: flex;
        flex-direction: column;
        gap: var(--ui-space-5);
    }
}

// ==================== 过渡 ====================
.settings-center-enter-active,
.settings-center-leave-active {
    transition: opacity var(--ui-dur-slow) var(--ui-ease);

    .settings-center {
        transition:
            opacity var(--ui-dur-slow) var(--ui-ease),
            transform var(--ui-dur-slow) var(--ui-ease);
    }
}

.settings-center-enter-from,
.settings-center-leave-to {
    opacity: 0;

    .settings-center {
        opacity: 0;
        transform: scale(0.98);
    }
}

// ==================== 移动端 ====================
@include respond-to(mobile) {
    .settings-center {
        flex-direction: column;
        width: calc(100vw - 24px);
        height: min(640px, calc(100vh - 48px));
        max-height: calc(100vh - 48px);
    }

    .settings-nav {
        flex: none;
        flex-direction: row;
        align-items: center;
        gap: var(--ui-space-1);
        padding: var(--ui-space-2);
        border-right: none;
        border-bottom: 1px solid var(--ui-hairline);
        overflow-x: auto;
        overflow-y: hidden;

        &__title,
        &__group-title {
            display: none;
        }

        &__group {
            flex-direction: row;
            gap: var(--ui-space-1);

            & + & {
                margin-top: 0;
            }
        }

        &__item {
            white-space: nowrap;
            padding: 0 var(--ui-space-3);
        }
    }

    .settings-panel {
        &__header {
            padding: var(--ui-space-3) var(--ui-space-4);
        }

        &__body {
            padding: var(--ui-space-4);
        }
    }
}
</style>
