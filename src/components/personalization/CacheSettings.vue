<script setup lang="ts">
/**
 * CacheSettings - 本地缓存设置
 *
 * 站点图标、搜索引擎图标与网络壁纸默认缓存在 IndexedDB（mediaCacheService）里，
 * 这里提供总开关、用量展示与一键清理。
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

async function handleToggle(enabled: boolean): Promise<void> {
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
    <SettingsSection
        title="本地缓存"
        description="图标缓存 7 天、壁纸缓存 30 天后自动过期，只缓存 http(s) 资源，本地图片与内置图标不占空间。"
    >
        <SettingsRow
            label="启用本地缓存"
            description="站点图标、搜索引擎图标与网络壁纸存到本地，不再每次打开都请求网络"
        >
            <template #actions>
                <BaseSwitch
                    :model-value="cacheStore.enabled"
                    aria-label="启用本地缓存"
                    @update:model-value="handleToggle"
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
