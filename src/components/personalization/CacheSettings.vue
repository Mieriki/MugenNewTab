<script setup lang="ts">
/**
 * CacheSettings - 本地缓存设置
 *
 * 站点图标、搜索引擎图标与网络壁纸默认缓存在 IndexedDB（mediaCacheService）里，
 * 这里提供图标 / 壁纸两个独立开关、用量展示与一键清理。
 */
import { computed, onMounted } from 'vue';
import BaseButton from '@/components/common/BaseButton.vue';
import BaseSwitch from '@/components/common/BaseSwitch.vue';
import SettingsSection from '@/components/settings/SettingsSection.vue';
import SettingsRow from '@/components/settings/SettingsRow.vue';
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

async function handleIconToggle(enabled: boolean): Promise<void> {
    await cacheStore.setIconEnabled(enabled);
    toast.success(enabled ? '已开启图标缓存' : '已关闭图标缓存');
}

async function handleWallpaperToggle(enabled: boolean): Promise<void> {
    await cacheStore.setWallpaperEnabled(enabled);
    toast.success(enabled ? '已开启壁纸缓存' : '已关闭壁纸缓存');
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
    <SettingsSection
        title="本地缓存"
        description="图标缓存 7 天、壁纸缓存 30 天后自动过期，只缓存 http(s) 资源，本地图片与内置图标不占空间。"
    >
        <SettingsRow
            label="缓存图标"
            description="站点图标与搜索引擎图标存到本地，不再每次打开都请求网络"
        >
            <template #actions>
                <BaseSwitch
                    :model-value="cacheStore.iconEnabled"
                    aria-label="缓存图标"
                    @update:model-value="handleIconToggle"
                />
            </template>
        </SettingsRow>

        <SettingsRow
            label="缓存网络壁纸"
            description="随机 / 动态壁纸接口请关闭此项，否则会固定为首次抓到的图片"
        >
            <template #actions>
                <BaseSwitch
                    :model-value="cacheStore.wallpaperEnabled"
                    aria-label="缓存网络壁纸"
                    @update:model-value="handleWallpaperToggle"
                />
            </template>
        </SettingsRow>

        <SettingsRow
            label="已占用空间"
            :description="breakdownText || '关闭后不再读写缓存，已有缓存会保留，重新开启即可复用'"
        >
            <template #actions>
                <span class="cache-settings__usage">{{ usageText }}</span>
                <BaseButton
                    variant="outlined"
                    size="small"
                    :disabled="cacheStore.loading || !stats.count"
                    @click="handleClear"
                >
                    {{ cacheStore.loading ? '清理中…' : '清理缓存' }}
                </BaseButton>
            </template>
        </SettingsRow>
    </SettingsSection>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.cache-settings__usage {
    font-size: var(--ui-font-caption);
    color: var(--ui-muted);
    white-space: nowrap;
}
</style>
