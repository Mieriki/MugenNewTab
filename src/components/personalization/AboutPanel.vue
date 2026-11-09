<script setup lang="ts">
/**
 * AboutPanel - 关于
 *
 * 只呈现已有能力：当前版本（扩展 manifest）、手动检查更新、仓库与问题反馈入口。
 * 版本号在非扩展环境（`npm run dev` 直接开网页）读不到，此时显示「开发环境」。
 */
import { computed } from 'vue';
import BaseButton from '@/components/common/BaseButton.vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import SettingsSection from '@/components/settings/SettingsSection.vue';
import SettingsRow from '@/components/settings/SettingsRow.vue';
import { useUpdateCheck } from '@/composables/useUpdateCheck';
import { useToast } from '@/composables/useToast';
import { RELEASE_REPO } from '@/composables/useUpdateCheck';
import { openUrl } from '@/utils/navigation.util';

const toast = useToast();
const {
    currentVersion,
    latestVersion,
    hasUpdate,
    isChecking,
    check,
    openDownload,
} = useUpdateCheck();

/** 仓库主页：与发布仓库同源，避免两处硬编码 */
const REPO_URL = `https://github.com/${RELEASE_REPO}`;

const versionText = computed(() => currentVersion.value ?? '开发环境');

const updateHint = computed(() => {
    if (isChecking.value) {
        return '正在检查…';
    }
    if (hasUpdate.value && latestVersion.value) {
        return `发现新版本 ${latestVersion.value}`;
    }
    if (latestVersion.value) {
        return '已是最新版本';
    }
    return '手动检查是否有新版本';
});

async function handleCheck(): Promise<void> {
    if (!currentVersion.value) {
        toast.info('开发环境下无法读取扩展版本号');
        return;
    }
    await check(true);
    if (!hasUpdate.value) {
        toast.success('已是最新版本');
    }
}

function openRepo(): void {
    openUrl(REPO_URL, 'new-tab');
}
</script>

<template>
    <SettingsSection title="关于">
        <SettingsRow label="Mugen 新标签页" :description="`版本 ${versionText}`">
            <template #actions>
                <BaseButton
                    :variant="hasUpdate ? 'primary' : 'outlined'"
                    size="small"
                    :loading="isChecking"
                    @click="hasUpdate ? openDownload() : handleCheck()"
                >
                    {{ hasUpdate ? '获取更新' : '检查更新' }}
                </BaseButton>
            </template>
        </SettingsRow>

        <SettingsRow label="更新状态" :description="updateHint" />

        <SettingsRow label="项目仓库" description="源码、更新日志与问题反馈">
            <template #actions>
                <BaseButton variant="ghost" size="small" @click="openRepo">
                    <template #icon>
                        <IconSvg name="link" :size="14" monochrome />
                    </template>
                    打开
                </BaseButton>
            </template>
        </SettingsRow>
    </SettingsSection>
</template>
