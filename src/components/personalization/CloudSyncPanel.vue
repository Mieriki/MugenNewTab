<script setup lang="ts">
/**
 * CloudSyncPanel - 云同步状态面板
 *
 * 通过 useCloudSync 管理 GitHub / Gitee 代码片段（Gist）同步状态。
 * 未登录时提供平台选择与 Token 输入框；已登录时展示用户信息、自动同步开关与操作按钮。
 * 「立即同步」执行双向增量合并（冲突本地优先）；「强制恢复云端」为云端覆盖本地的兜底操作。
 * 提示使用 useToast，确认/输入框使用 useConfirm（依赖 App.vue 挂载的 MntConfirmHost）。
 */
import { computed, ref } from 'vue';
import { useCloudSync } from '@/composables/useCloudSync';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import type { PromptOptions } from '@/composables/useConfirm';
import IconSvg from '@/components/icon/IconSvg.vue';
import BaseInput from '@/components/common/BaseInput.vue';
import BaseButton from '@/components/common/BaseButton.vue';

export interface CloudSyncPanelProps {
    /** 面板标题 */
    title?: string;
}

const props = withDefaults(defineProps<CloudSyncPanelProps>(), {
    title: '云同步'
});

const title = computed(() => props.title);

const emit = defineEmits<{
    (e: 'login', success: boolean): void;
    (e: 'logout'): void;
    (e: 'upload', result: { success: boolean; message?: string }): void;
    (e: 'pull', result: { success: boolean; applied?: boolean; message?: string }): void;
    (e: 'error', message: string): void;
}>();

const toast = useToast();
const confirmDialog = useConfirm();

const {
    isLoggedIn,
    userInfo,
    statusText,
    formattedLastSyncTime,
    autoSync,
    isLoading,
    error,
    login,
    logout,
    sync,
    pullAndApply,
    setAutoSync
} = useCloudSync({
    uiAdapter: {
        showToast: (message, type = 'info') => {
            toast.show(message, { type });
        },
        showConfirm: (message, options) => confirmDialog.confirm(message, options),
        showPrompt: (message, options) => confirmDialog.prompt(message, options as PromptOptions | undefined)
    }
});

const tokenInput = ref('');

type ProviderId = 'github' | 'gitee';

const PROVIDER_OPTIONS: Array<{ id: ProviderId; name: string; placeholder: string; hint: string }> = [
    {
        id: 'github',
        name: 'GitHub',
        placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
        hint: '在 github.com/settings/tokens 创建 Token（需要 gist 权限）'
    },
    {
        id: 'gitee',
        name: 'Gitee',
        placeholder: 'xxxxxxxxxxxxxxxx',
        hint: '在 gitee.com/profile/personal_access_tokens 创建私人令牌（勾选 gists 权限）'
    }
];

const selectedProvider = ref<ProviderId>('github');

const currentProviderOption = computed(() => PROVIDER_OPTIONS.find((option) => option.id === selectedProvider.value) ?? PROVIDER_OPTIONS[0]);

const CLOUD_PATH = 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z';

async function handleLogin(): Promise<void> {
    const token = tokenInput.value.trim();
    if (!token) {
        toast.show('请输入 Token', { type: 'error' });
        return;
    }

    try {
        const success = await login(token, selectedProvider.value);
        emit('login', success);
        if (success) {
            tokenInput.value = '';
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit('error', message);
    }
}

async function handleLogout(): Promise<void> {
    try {
        await logout();
        emit('logout');
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit('error', message);
    }
}

async function handleSync(): Promise<void> {
    try {
        const result = await sync();
        emit('upload', { success: result.success, message: result.message });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit('error', message);
    }
}

async function handlePull(): Promise<void> {
    try {
        const result = await pullAndApply({ force: true });
        emit('pull', {
            success: result.success,
            applied: result.applied,
            message: result.message
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit('error', message);
    }
}

async function handleAutoSyncChange(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    try {
        await setAutoSync(checked);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit('error', message);
    }
}

const statusClass = computed(() => {
    if (isLoading.value) {
        return 'is-loading';
    }
    return isLoggedIn.value ? 'is-connected' : 'is-disconnected';
});
</script>

<template>
    <section class="cloud-sync-panel" aria-label="云同步">
        <header class="cloud-sync-panel__header">
            <IconSvg :path="CLOUD_PATH" :size="18" color="var(--md-sys-color-primary)" />
            <h3 class="cloud-sync-panel__title">{{ title }}</h3>
        </header>

        <div v-if="error" class="cloud-sync-panel__error" role="alert">
            {{ error }}
        </div>

        <div class="cloud-sync-panel__status" :class="statusClass">
            {{ statusText }}
        </div>

        <div v-if="!isLoggedIn" class="cloud-sync-panel__guest">
            <p class="cloud-sync-panel__hint">
                使用 GitHub / Gitee 代码片段（Gist）备份和同步你的站点数据
            </p>

            <div class="cloud-sync-provider" role="tablist" aria-label="同步平台">
                <button
                    v-for="option in PROVIDER_OPTIONS"
                    :key="option.id"
                    type="button"
                    role="tab"
                    class="cloud-sync-provider__btn"
                    :class="{ 'is-active': selectedProvider === option.id }"
                    :aria-selected="selectedProvider === option.id"
                    :disabled="isLoading"
                    @click="selectedProvider = option.id"
                >
                    {{ option.name }}
                </button>
            </div>

            <BaseInput
                v-model="tokenInput"
                type="password"
                :label="`${currentProviderOption.name} Token`"
                :placeholder="currentProviderOption.placeholder"
                autocomplete="off"
                :disabled="isLoading"
                @enter="handleLogin"
            />

            <p class="cloud-sync-panel__hint">{{ currentProviderOption.hint }}</p>

            <BaseButton
                variant="primary"
                size="small"
                block
                :loading="isLoading"
                @click="handleLogin"
            >
                <template #icon>
                    <IconSvg name="link" :size="16" />
                </template>
                连接 {{ currentProviderOption.name }}
            </BaseButton>
        </div>

        <div v-else class="cloud-sync-panel__logged">
            <div v-if="userInfo" class="cloud-sync-user">
                <img
                    :src="userInfo.avatar"
                    alt=""
                    class="cloud-sync-user__avatar"
                    loading="lazy"
                />
                <div class="cloud-sync-user__info">
                    <div class="cloud-sync-user__name">{{ userInfo.login }}</div>
                    <div class="cloud-sync-user__time">
                        上次同步：{{ formattedLastSyncTime }}
                    </div>
                </div>
            </div>

            <label class="cloud-sync-toggle">
                <input
                    type="checkbox"
                    :checked="autoSync"
                    :disabled="isLoading"
                    @change="handleAutoSyncChange"
                >
                <span>自动同步</span>
            </label>

            <div class="cloud-sync-actions">
                <BaseButton
                    variant="primary"
                    size="small"
                    :loading="isLoading"
                    @click="handleSync"
                >
                    <template #icon>
                        <IconSvg name="upload" :size="16" />
                    </template>
                    立即同步
                </BaseButton>

                <BaseButton
                    variant="outlined"
                    size="small"
                    :loading="isLoading"
                    @click="handlePull"
                >
                    <template #icon>
                        <IconSvg name="download" :size="16" />
                    </template>
                    强制恢复云端
                </BaseButton>
            </div>

            <BaseButton
                variant="text"
                size="small"
                class="cloud-sync-logout"
                :loading="isLoading"
                @click="handleLogout"
            >
                <template #icon>
                    <IconSvg name="logout" :size="16" />
                </template>
                断开连接
            </BaseButton>
        </div>
    </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.cloud-sync-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;

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

    &__error {
        font-size: 12px;
        color: var(--md-sys-color-error);
        padding: 8px 10px;
        border-radius: 8px;
        background: var(--md-sys-color-error-container);
    }

    &__status {
        font-size: 13px;
        color: var(--md-sys-color-on-surface-variant);

        &.is-connected {
            color: var(--md-sys-color-success);
        }

        &.is-loading {
            color: var(--md-sys-color-primary);
        }
    }

    &__guest {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    &__hint {
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.4;
        margin: 0;
    }

    &__logged {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
}

.cloud-sync-user {
    display: flex;
    align-items: center;
    gap: 10px;

    &__avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        object-fit: cover;
        background: var(--md-sys-color-surface-variant);
        flex-shrink: 0;
    }

    &__info {
        flex: 1;
        min-width: 0;
    }

    &__name {
        font-size: 14px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
        @include text-ellipsis;
    }

    &__time {
        font-size: 12px;
        color: var(--md-sys-color-on-surface-variant);
    }
}

.cloud-sync-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--md-sys-color-on-surface);
    cursor: pointer;

    input {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: var(--md-sys-color-primary);
    }
}

.cloud-sync-provider {
    display: flex;
    gap: 6px;

    &__btn {
        flex: 1;
        padding: 6px 0;
        border: 1px solid var(--md-sys-color-outline-variant);
        border-radius: 8px;
        background: transparent;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 13px;
        cursor: pointer;
        transition: background-color 0.2s, color 0.2s, border-color 0.2s;

        &.is-active {
            background: var(--md-sys-color-primary-container);
            color: var(--md-sys-color-on-primary-container);
            border-color: var(--md-sys-color-primary);
        }

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }
}

.cloud-sync-actions {
    display: flex;
    gap: 8px;

    > * {
        flex: 1;
    }
}

.cloud-sync-logout {
    align-self: flex-start;
    color: var(--md-sys-color-error);
}

html.dark-mode,
body.dark-mode {
    .cloud-sync-user__avatar {
        background: rgba(255, 255, 255, 0.1);
    }
}
</style>
