<script setup lang="ts">
/**
 * DataTransferPanel - 数据导入导出
 *
 * 设置中心「数据与同步」下的一个分组。业务逻辑（序列化、文件写入、解析校验、
 * 覆盖写库）都留在 App.vue 的 handleExport / handleImportFile，这里只负责
 * 呈现与转发意图，避免同一套导入逻辑出现两份实现。
 */
import IconSvg from '@/components/icon/IconSvg.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import SettingsSection from '@/components/settings/SettingsSection.vue';
import SettingsRow from '@/components/settings/SettingsRow.vue';

const emit = defineEmits<{
    (e: 'export-data'): void;
    (e: 'import-data'): void;
}>();
</script>

<template>
    <SettingsSection
        title="数据"
        description="备份文件为 JSON，含分类、站点与自定义图标库。"
    >
        <SettingsRow
            label="导出数据"
            description="把当前全部数据下载为 JSON 备份文件"
        >
            <template #actions>
                <BaseButton variant="outlined" size="small" @click="emit('export-data')">
                    <template #icon>
                        <IconSvg name="download" :size="14" monochrome />
                    </template>
                    导出
                </BaseButton>
            </template>
        </SettingsRow>

        <SettingsRow
            label="导入数据"
            description="从备份文件恢复，将覆盖当前全部数据"
        >
            <template #actions>
                <BaseButton variant="outlined" size="small" @click="emit('import-data')">
                    <template #icon>
                        <IconSvg name="upload" :size="14" monochrome />
                    </template>
                    导入
                </BaseButton>
            </template>
        </SettingsRow>
    </SettingsSection>
</template>
