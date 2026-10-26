<script setup lang="ts">
/**
 * CacheSettings - 本地缓存设置
 *
 * 站点图标与网络壁纸默认缓存在 IndexedDB（mediaCacheService）里，
 * 这里提供总开关、用量展示与一键清理。
 */
import { computed, onMounted } from 'vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import { useCacheStore } from '@/stores/cache.store';
import { useToast } from '@/composables/useToast';
import { formatFileSize } from '@/utils/file.util';

const cacheStore = useCacheStore();
const toast = useToast();

const stats = computed(() => cacheStore.stats);

/** 缓存占用的人类可读文案 */
const usageText = computed(() => {
    if (!cacheStore.isAvailable()) {
        return '当前环境不支持本地缓存';
    }
    if (!stats.value.count) {
        return '暂无缓存';
    }
    return `${stats.value.count} 项 · ${formatFileSize(stats.value.bytes)}`;
});

/** 分类明细 */
const breakdownText = computed(() => {
    const { icon, wallpaper } = stats.value.byKind;
    if (!icon && !wallpaper) {
        return '';
    }
    const parts: string[] = [];
    if (icon) parts.push(`图标 ${icon}`);
    if (wallpaper) parts.push(`壁纸 ${wallpaper}`);
    return parts.join(' / ');
});

onMounted(() => {
    void cacheStore.init().then(() => cacheStore.refreshStats());
});

async function handleToggle(event: Event): Promise<void> {
    const enabled = (event.target as HTMLInputElement).checked;
    await cacheStore.setEnabled(enabled);
    toast.success(enabled ? '已开启本地缓存' : '已关闭本地缓存');
}

async function handleClear(): Promise<void> {
    if (!stats.value.count) {
        toast.info('当前没有可清理的缓存');
        return;
    }
    await cacheStore.clearCache();
    toast.success('缓存已清理');
}
</script>

<template>
    <section class="cache-settings" aria-label="本地缓存">
        <header class="cache-settings__header">
            <IconSvg name="download" :size="18" color="var(--md-sys-color-primary)" />
            <h3 class="cache-settings__title">本地缓存</h3>
        </header>

        <div class="cache-settings__group">
            <label class="cache-settings__toggle">
                <input
                    type="checkbox"
                    :checked="cacheStore.enabled"
                    @change="handleToggle"
                />
                <span>启用本地缓存（站点图标与网络壁纸存到本地，不再每次打开都请求网络）</span>
            </label>
            <p class="cache-settings__hint">
                关闭后不再读写缓存，已有缓存会保留，重新开启即可继续复用。
            </p>
        </div>

        <div class="cache-settings__group">
            <div class="cache-settings__usage">
                <span class="cache-settings__usage-label">已占用</span>
                <span class="cache-settings__usage-value">{{ usageText }}</span>
            </div>
            <p v-if="breakdownText" class="cache-settings__hint">{{ breakdownText }}</p>

            <button
                type="button"
                class="cache-settings__clear"
                :disabled="cacheStore.loading || !stats.count"
                @click="handleClear"
            >
                {{ cacheStore.loading ? '清理中…' : '清理缓存' }}
            </button>
        </div>

        <p class="cache-settings__note">
            图标缓存 7 天、壁纸缓存 30 天后自动过期；只缓存 http(s) 资源，本地图片与内置图标不占空间。
        </p>
    </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.cache-settings {
    display: flex;
    flex-direction: column;
    gap: 14px;

    &__header {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    &__title {
        font-size: 13px;
        font-weight: 600;
        color: var(--md-sys-color-primary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 0;
    }

    &__group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    &__toggle {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        cursor: pointer;
        font-size: 13px;
        line-height: 1.5;
        color: var(--md-sys-color-on-surface);

        input[type='checkbox'] {
            width: 18px;
            height: 18px;
            margin-top: 1px;
            flex-shrink: 0;
            cursor: pointer;
            accent-color: var(--md-sys-color-primary);
        }
    }

    &__hint {
        margin: 0;
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
    }

    &__usage {
        display: flex;
        align-items: baseline;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--md-sys-color-surface-variant);
    }

    &__usage-label {
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
    }

    &__usage-value {
        font-size: 13px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface);
    }

    &__clear {
        @include button-reset;
        align-self: flex-start;
        padding: 7px 14px;
        border-radius: 8px;
        font-size: 13px;
        color: var(--md-sys-color-primary);
        background: var(--md-sys-color-surface-variant);
        border: 1px solid var(--md-sys-color-outline-variant);
        @include md-transition(all, var(--md-transition-fast));

        &:hover:not(:disabled) {
            border-color: var(--md-sys-color-primary);
            background: var(--md-sys-color-primary-container);
        }

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }

    &__note {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--md-sys-color-on-surface-variant);
    }
}
</style>
