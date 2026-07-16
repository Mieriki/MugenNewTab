<!--
  UiLibPicker - UI 图标库选择面板
  以模态面板形式展示系统与用户图标库，支持按分类切换、选择图标以及打开管理器。
-->
<template>
    <ModalOverlay
        v-model="isOpen"
        :show-close="false"
        max-width="640"
        max-height="80vh"
        :z-index="2100"
        @close="emit('close')"
    >
        <template #header>
            <div class="ui-lib-picker__title">
                <IconSvg name="picture" :size="20" />
                <span>UI 图标库</span>
            </div>
        </template>

        <div class="ui-lib-picker">
            <div v-if="store.isLoading" class="ui-lib-picker__state">图标库加载中…</div>

            <template v-else>
                <div v-if="categories.length === 0" class="ui-lib-picker__state">暂无图标分类</div>

                <div v-else class="ui-lib-picker__tabs" role="tablist">
                    <button
                        v-for="cat in categories"
                        :key="cat.id"
                        type="button"
                        class="ui-lib-picker__tab"
                        :class="{ 'is-active': activeCategoryId === cat.id }"
                        role="tab"
                        :aria-selected="activeCategoryId === cat.id"
                        @click="activeCategoryId = cat.id"
                    >
                        {{ cat.name }}
                    </button>
                </div>

                <div class="ui-lib-picker__content" role="tabpanel">
                    <div v-if="activeItems.length === 0" class="ui-lib-picker__state">该分类下暂无图标</div>
                    <div v-else class="ui-lib-picker__grid">
                        <button
                            v-for="item in activeItems"
                            :key="item.id"
                            type="button"
                            class="ui-lib-picker__item"
                            :class="{ 'is-selected': props.selected === item.url }"
                            :title="item.name"
                            @click="selectIcon(item.url)"
                        >
                            <span class="ui-lib-picker__icon">
                                <IconSvg :src="item.url" :size="32" :alt="item.name" />
                            </span>
                            <span class="ui-lib-picker__item-name">{{ item.name }}</span>
                        </button>
                    </div>
                </div>
            </template>
        </div>

        <template #footer>
            <BaseButton variant="outlined" size="small" @click="openManager">
                <template #icon>
                    <IconSvg name="setting" :size="16" />
                </template>
                管理 UI 库
            </BaseButton>
            <BaseButton variant="text" size="small" @click="close">关闭</BaseButton>
        </template>
    </ModalOverlay>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModalOverlay from '@/components/common/ModalOverlay.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import { useUiLibStore } from '@/stores/uiLib.store';

/** 组件 Props */
interface Props {
    /** 是否显示选择面板（支持 v-model） */
    modelValue: boolean;
    /** 当前已选中的图标 URL（用于高亮） */
    selected?: string;
}

const props = withDefaults(defineProps<Props>(), {
    selected: '',
});

const emit = defineEmits<{
    /** 面板显示状态变化 */
    (e: 'update:modelValue', value: boolean): void;
    /** 用户选择某个图标 */
    (e: 'select', url: string): void;
    /** 用户点击管理按钮 */
    (e: 'manage'): void;
    /** 面板关闭 */
    (e: 'close'): void;
}>();

const store = useUiLibStore();
const activeCategoryId = ref<string>('');

const isOpen = computed({
    get: () => props.modelValue,
    set: (value: boolean) => emit('update:modelValue', value),
});

const categories = computed(() => store.categories);

const activeItems = computed(() => {
    if (!activeCategoryId.value) {
        return [];
    }
    return store.items.filter(item => item.category === activeCategoryId.value);
});

/** 初始化并在打开时默认选中第一个分类 */
watch(
    () => props.modelValue,
    async (visible) => {
        if (visible) {
            await store.init();
            if (!activeCategoryId.value && categories.value.length > 0) {
                activeCategoryId.value = categories.value[0].id;
            }
        }
    },
    { immediate: true }
);

/** 分类变化后，若当前分类不存在则回退到第一个 */
watch(
    () => categories.value.map(c => c.id).join(','),
    () => {
        if (!categories.value.some(c => c.id === activeCategoryId.value)) {
            activeCategoryId.value = categories.value[0]?.id ?? '';
        }
    }
);

function selectIcon(url: string): void {
    emit('select', url);
    close();
}

function openManager(): void {
    emit('manage');
}

function close(): void {
    isOpen.value = false;
    emit('close');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
@use '@/styles/mixins.scss' as *;

.ui-lib-picker {
    display: flex;
    flex-direction: column;
    min-height: 320px;

    &__title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
    }

    &__state {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 14px;
    }

    &__tabs {
        display: flex;
        gap: 8px;
        padding: 12px 24px;
        border-bottom: 1px solid var(--md-sys-color-outline-variant);
        overflow-x: auto;
        @include hide-scrollbar;
    }

    &__tab {
        @include button-reset;
        padding: 6px 14px;
        border-radius: 20px;
        border: 1px solid var(--md-sys-color-outline);
        background: transparent;
        color: var(--md-sys-color-on-surface);
        font-size: 13px;
        white-space: nowrap;
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover {
            border-color: var(--md-sys-color-primary);
            color: var(--md-sys-color-primary);
        }

        &.is-active {
            background: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            border-color: var(--md-sys-color-primary);
        }
    }

    &__content {
        flex: 1;
        overflow-y: auto;
        padding: 16px 24px;
        @include hide-scrollbar;
    }

    &__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
        gap: 12px;
    }

    &__item {
        @include button-reset;
        aspect-ratio: 1;
        border-radius: 12px;
        border: 2px solid var(--md-sys-color-outline-variant);
        background: var(--md-sys-color-surface-variant);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 8px;
        @include md-transition(all, var(--md-transition-fast));
        @include focus-ring;

        &:hover,
        &:focus-visible {
            border-color: var(--md-sys-color-primary);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        &.is-selected {
            border-color: var(--md-sys-color-primary);
            background: var(--md-sys-color-primary-container);
        }
    }

    &__icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    &__item-name {
        font-size: 11px;
        color: var(--md-sys-color-on-surface-variant);
        text-align: center;
        @include text-ellipsis;
        width: 100%;
    }
}

// 深色模式适配
:global(html.dark-mode),
:global(body.dark-mode) {
    .ui-lib-picker__item:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }
}
</style>
