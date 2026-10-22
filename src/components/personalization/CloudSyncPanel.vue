<script setup lang="ts">
/**
 * CloudSyncPanel - 云同步状态面板
 *
 * 两条互补的同步路径：
 *   1. 云同步：用 GitHub / Gitee 的 Token 读写 Gist（数据本体）；
 *   2. 浏览器同步：把 Token 加密后写进浏览器账号同步区（storage.sync），
 *      让同一浏览器账号的其他设备免 Token 登录，再自动拉取 Gist 数据。
 *
 * 浏览器同步区块在未登录 / 已登录两种状态下都常驻显示：
 * 未登录时可以先设密码（登录后自动补推凭据），也可以凭密码恢复其他设备的登录状态。
 * 提示使用 useToast，确认/输入框使用 useConfirm（依赖 App.vue 挂载的 MntConfirmHost）。
 */
import { computed, ref } from 'vue';
import { useCloudSync } from '@/composables/useCloudSync';
import { useToast } from '@/composables/useToast';
import { useConfirm } from '@/composables/useConfirm';
import type { PromptOptions } from '@/composables/useConfirm';
import { MIN_PASSPHRASE_LENGTH } from '@/utils/crypto.util';
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
    crossDeviceEnabled,
    crossDeviceHasPassphrase,
    crossDeviceRemoteAvailable,
    crossDeviceRemoteMeta,
    syncAreaNative,
    login,
    logout,
    sync,
    pullAndApply,
    setAutoSync,
    enableCrossDeviceSync,
    disableCrossDeviceSync,
    restoreFromCrossDevice,
    refreshCrossDevice,
    tryRestoreCrossDevice
} = useCloudSync({
    uiAdapter: {
        showToast: (message, type = 'info') => {
            toast.show(message, { type });
        },
        showConfirm: (message, options) => confirmDialog.confirm(message, options),
        showPrompt: (message, options) => confirmDialog.prompt(message, options as PromptOptions | undefined)
    }
});

/** 浏览器同步：密码输入值（开启 / 更新 / 恢复共用） */
const browserPassphrase = ref('');
/** 浏览器同步：正在执行开启 / 关闭 / 恢复 */
const browserBusy = ref(false);
/** 浏览器同步：用户是否点了「开启浏览器同步」（展开密码输入） */
const browserExpanded = ref(false);
/** 浏览器同步：用户放弃恢复旧凭据，直接在本机开启 */
const browserSkipRestore = ref(false);

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

/** 挂锁图标（浏览器同步） */
const LOCK_PATHS = [
    'M7 11V7a5 5 0 0 1 10 0v4',
    'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z'
];

/**
 * 浏览器同步的界面状态
 * - off：未开启，只显示开关
 * - setup：已展开开关，等待输入密码开启
 * - restore：同步区已有其他设备的密文，优先提示恢复登录
 * - enabled：已开启且本机有密码
 * - missing-passphrase：已开启但本机密码丢失（清理过浏览器数据）
 */
type BrowserMode = 'off' | 'setup' | 'restore' | 'enabled' | 'missing-passphrase';

const browserMode = computed<BrowserMode>(() => {
    // 未登录 + 同步区已有凭据 → 优先引导恢复（即使本机开关是「已开启」，
    // 也可能是密码对不上，需要用户重新输入）
    if (!isLoggedIn.value && crossDeviceRemoteAvailable.value && !browserSkipRestore.value) {
        return 'restore';
    }
    if (crossDeviceEnabled.value) {
        return crossDeviceHasPassphrase.value ? 'enabled' : 'missing-passphrase';
    }
    return browserExpanded.value ? 'setup' : 'off';
});

/** 是否 Firefox：storage.sync 的同步节奏与开关位置和其他浏览器不同，提示文案要分开 */
const isFirefox = computed(
    () => typeof navigator !== 'undefined' && /Firefox\//.test(navigator.userAgent)
);

/**
 * 当前扩展 ID
 *
 * Firefox 的 storage.sync 按扩展 ID 隔离：两台设备如果装的是不同 ID 的包
 * （例如一个是旧的签名版、一个是新构建），同步区永远对不上。
 * 这里只放在 title 里，排查时鼠标悬停即可看到。
 */
const extensionId = computed(() => {
    if (typeof window === 'undefined') return '';
    const win = window as unknown as {
        browser?: { runtime?: { id?: string } };
        chrome?: { runtime?: { id?: string } };
    };
    return win.browser?.runtime?.id ?? win.chrome?.runtime?.id ?? '';
});

/** 同步区凭据的来源描述 */
const remoteMetaText = computed(() => {
    const meta = crossDeviceRemoteMeta.value;
    if (!meta) return '有（来源未知）';
    return `有（${meta.device}，${formatCompactTime(meta.updatedAt)}）`;
});

/** 紧凑时间：10-22 15:29（面板宽度有限，不显示年份与秒） */
function formatCompactTime(timestamp: number): string {
    const date = new Date(timestamp);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const browserNeedsPassphrase = computed(
    () => browserMode.value !== 'off' && (browserMode.value !== 'enabled' || browserExpanded.value)
);

const browserActionLabel = computed(() => {
    switch (browserMode.value) {
        case 'restore':
            return '恢复登录状态';
        case 'missing-passphrase':
            return '重新设置同步密码';
        case 'enabled':
            return '更新同步密码';
        default:
            return '开启并加密同步';
    }
});

const browserHint = computed(() => {
    switch (browserMode.value) {
        case 'restore':
            return '输入在原设备设置的同步密码，即可免 Token 恢复登录；密码只在本机校验，不会上传。';
        case 'missing-passphrase':
            return '本机缺少同步密码（可能清理过浏览器数据）。重新设置会用新密码覆盖同步区里的旧密文。';
        case 'enabled':
            return '更新密码会用新密码重新加密并覆盖同步区里的旧密文，其他设备需要用新密码恢复。';
        default:
            return `同步密码只保存在本机、不会上传。换设备时输入同一密码即可还原登录状态（至少 ${MIN_PASSPHRASE_LENGTH} 位）。`;
    }
});

const browserStatusText = computed(() => {
    if (browserMode.value === 'enabled') {
        if (!isLoggedIn.value) {
            return '已开启 · 登录后会把登录状态加密写入同步区';
        }
        if (!syncAreaNative.value) {
            return '已开启 · 当前环境无法写入浏览器同步区';
        }
        return '已开启 · 登录状态已加密写入浏览器同步区';
    }
    if (browserMode.value === 'missing-passphrase') {
        return '已开启，但本机缺少同步密码';
    }
    if (browserMode.value === 'restore') {
        return '检测到其他设备的登录状态';
    }
    return '未开启';
});

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

/** 勾选「开启浏览器同步」：展开密码输入 */
function handleBrowserToggle(event: Event): void {
    browserExpanded.value = (event.target as HTMLInputElement).checked;
    if (!browserExpanded.value) {
        browserPassphrase.value = '';
    }
}

/** 开启 / 更新浏览器同步 */
async function handleEnableBrowserSync(): Promise<void> {
    const passphrase = browserPassphrase.value;
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        toast.show(`同步密码至少 ${MIN_PASSPHRASE_LENGTH} 位`, { type: 'error' });
        return;
    }

    browserBusy.value = true;
    try {
        const { pushed, restored } = await enableCrossDeviceSync(passphrase);
        browserPassphrase.value = '';
        browserExpanded.value = false;

        if (restored) {
            toast.show('已开启浏览器同步，并从同步区恢复了其他设备的登录状态', { type: 'success' });
        } else if (pushed) {
            toast.show('已开启浏览器同步，登录状态已加密写入同步区', { type: 'success' });
        } else if (isLoggedIn.value) {
            toast.show('已开启浏览器同步，但本次未能写入同步区，请检查浏览器账号同步设置', { type: 'error' });
        } else if (crossDeviceRemoteAvailable.value) {
            toast.show('已开启，但同步区里的密码对不上，请用原设备的同步密码恢复', { type: 'error' });
        } else {
            toast.show('已开启浏览器同步，登录后会自动加密同步登录状态', { type: 'success' });
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit('error', message);
        toast.show(message, { type: 'error' });
    } finally {
        browserBusy.value = false;
    }
}

/** 重新读取同步区状态，并尝试用本机密码免 Token 还原 */
async function handleRefreshSyncArea(): Promise<void> {
    browserBusy.value = true;
    try {
        await refreshCrossDevice();
        const restored = await tryRestoreCrossDevice();
        if (restored) {
            toast.show('已从同步区恢复登录状态', { type: 'success' });
        } else if (!crossDeviceRemoteAvailable.value) {
            toast.show(
                isFirefox.value
                    ? '同步区暂无凭据：Firefox 需在「设置 → 同步」勾选「附加组件」，并每 10 分钟或点「立即同步」才会同步'
                    : '同步区暂无凭据：请确认两台设备登录的是同一个浏览器账号，并已开启同步',
                { type: 'info' }
            );
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit('error', message);
    } finally {
        browserBusy.value = false;
    }
}

/** 凭密码恢复其他设备的登录状态 */
async function handleRestoreBrowserAuth(): Promise<void> {
    const passphrase = browserPassphrase.value;
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        toast.show(`同步密码至少 ${MIN_PASSPHRASE_LENGTH} 位`, { type: 'error' });
        return;
    }

    browserBusy.value = true;
    try {
        const success = await restoreFromCrossDevice(passphrase);
        if (success) {
            browserPassphrase.value = '';
            browserExpanded.value = false;
            toast.show('已从其他设备恢复登录状态，正在同步数据', { type: 'success' });
        } else {
            toast.show('同步区没有可用的登录凭据', { type: 'error' });
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit('error', message);
        toast.show(message, { type: 'error' });
    } finally {
        browserBusy.value = false;
    }
}

/** 关闭浏览器同步（清除本机密码与同步区密文） */
async function handleDisableBrowserSync(): Promise<void> {
    const confirmed = await confirmDialog.confirm(
        '关闭后将从浏览器同步区清除已加密的登录凭据，其他设备需要重新输入 Token。',
        { title: '关闭浏览器同步', okText: '关闭', isDanger: true }
    );
    if (!confirmed) {
        browserExpanded.value = false;
        return;
    }

    browserBusy.value = true;
    try {
        await disableCrossDeviceSync();
        browserExpanded.value = false;
        browserPassphrase.value = '';
        toast.show('已关闭浏览器同步', { type: 'info' });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit('error', message);
        toast.show(message, { type: 'error' });
    } finally {
        browserBusy.value = false;
    }
}

/** 密码框回车：按当前状态执行开启 / 更新 / 恢复 */
function handleBrowserSubmit(): void {
    if (browserMode.value === 'restore') {
        void handleRestoreBrowserAuth();
        return;
    }
    void handleEnableBrowserSync();
}

/** 放弃用旧密码恢复，直接在本机开启新的浏览器同步 */
function handleSkipRestore(): void {
    browserSkipRestore.value = true;
    browserExpanded.value = true;
    browserPassphrase.value = '';
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

        <!-- ============ 浏览器同步（始终可见） ============ -->
        <div
            class="cloud-sync-cross"
            :class="{
                'is-restore': browserMode === 'restore',
                'is-on': browserMode === 'enabled',
                'is-unavailable': !syncAreaNative
            }"
        >
            <div class="cloud-sync-cross__head">
                <IconSvg :paths="LOCK_PATHS" :size="16" color="var(--md-sys-color-primary)" />
                <span class="cloud-sync-cross__name">浏览器同步</span>
                <span v-if="browserMode === 'enabled'" class="cloud-sync-cross__badge">已开启</span>
            </div>

            <p v-if="browserMode !== 'off' && browserMode !== 'setup'" class="cloud-sync-cross__status">
                {{ browserStatusText }}
            </p>

            <p v-if="browserMode === 'off' || browserMode === 'setup'" class="cloud-sync-panel__hint">
                登录同一浏览器账号的其他设备，输入同步密码即可免 Token 登录。同步区只保存 AES-GCM 密文。
            </p>

            <p v-if="!syncAreaNative" class="cloud-sync-cross__warn">
                当前为网页预览环境，无法写入浏览器账号同步区，该功能仅在扩展中生效。
            </p>

            <label v-if="browserMode === 'off' || browserMode === 'setup'" class="cloud-sync-toggle">
                <input
                    type="checkbox"
                    :checked="browserMode === 'setup'"
                    :disabled="isLoading || browserBusy"
                    @change="handleBrowserToggle"
                >
                <span>开启浏览器同步</span>
            </label>

            <template v-if="browserNeedsPassphrase">
                <p class="cloud-sync-panel__hint">{{ browserHint }}</p>
                <BaseInput
                    v-model="browserPassphrase"
                    type="password"
                    label="同步密码"
                    :placeholder="`至少 ${MIN_PASSPHRASE_LENGTH} 位`"
                    autocomplete="off"
                    :disabled="browserBusy"
                    @enter="handleBrowserSubmit"
                />
                <BaseButton
                    :variant="browserMode === 'restore' ? 'primary' : 'outlined'"
                    size="small"
                    block
                    :loading="browserBusy"
                    @click="handleBrowserSubmit"
                >
                    <template #icon>
                        <IconSvg :paths="LOCK_PATHS" :size="16" />
                    </template>
                    {{ browserActionLabel }}
                </BaseButton>
            </template>

            <BaseButton
                v-if="browserMode === 'restore'"
                variant="text"
                size="small"
                class="cloud-sync-cross__skip"
                @click="handleSkipRestore"
            >
                没有旧密码？直接开启新的浏览器同步
            </BaseButton>

            <div v-if="browserMode === 'enabled'" class="cloud-sync-cross__actions">
                <BaseButton
                    variant="text"
                    size="small"
                    :disabled="browserBusy"
                    @click="browserExpanded = !browserExpanded"
                >
                    {{ browserExpanded ? '收起' : '更新密码' }}
                </BaseButton>
                <BaseButton
                    variant="text"
                    size="small"
                    :disabled="browserBusy"
                    @click="handleDisableBrowserSync"
                >
                    关闭浏览器同步
                </BaseButton>
            </div>

            <!-- 同步区诊断：让「到底同步到了没」可见，而不是靠猜 -->
            <div class="cloud-sync-cross__diag">
                <span :title="extensionId ? `扩展 ID：${extensionId}` : ''">
                    同步区：{{ syncAreaNative ? '浏览器账号' : '本机模拟' }}
                </span>
                <span>凭据：{{ crossDeviceRemoteAvailable ? remoteMetaText : '暂无' }}</span>
                <button
                    type="button"
                    class="cloud-sync-cross__refresh"
                    :disabled="browserBusy"
                    @click="handleRefreshSyncArea"
                >
                    重新检查
                </button>
            </div>

            <p
                v-if="syncAreaNative && !crossDeviceRemoteAvailable && !isLoggedIn"
                class="cloud-sync-cross__warn"
            >
                <template v-if="isFirefox">
                    Firefox 需在「设置 → 同步」勾选「附加组件」，且每 10 分钟或点「立即同步」才会把同步区数据传到另一台设备。
                </template>
                <template v-else>
                    两台设备需登录同一个浏览器账号并开启同步，数据才会在同步区之间流转。
                </template>
            </p>
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

.cloud-sync-cross {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: 12px;
    background: var(--md-sys-color-surface-container-low, transparent);

    &.is-restore,
    &.is-on {
        border-color: var(--md-sys-color-primary);
    }

    &.is-unavailable {
        border-style: dashed;
        opacity: 0.9;
    }

    &__head {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface);
    }

    &__name {
        flex: 1;
        min-width: 0;
    }

    &__badge {
        flex-shrink: 0;
        padding: 1px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        color: var(--md-sys-color-on-surface-variant);
        background: var(--md-sys-color-surface-variant);
    }

    &.is-on &__badge {
        color: var(--md-sys-color-on-primary);
        background: var(--md-sys-color-primary);
    }

    &__status {
        margin: 0;
        font-size: 12px;
        font-weight: 500;
        color: var(--md-sys-color-on-surface-variant);
    }

    &.is-on &__status {
        color: var(--md-sys-color-success);
    }

    &__warn {
        margin: 0;
        font-size: 12px;
        line-height: 1.4;
        padding: 6px 8px;
        border-radius: 8px;
        color: var(--md-sys-color-on-surface-variant);
        background: var(--md-sys-color-surface-variant);
    }

    &__actions {
        display: flex;
        gap: 4px;

        > * {
            flex: 1;
        }
    }

    &__skip {
        align-self: flex-start;
    }

    &__diag {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        padding-top: 8px;
        border-top: 1px dashed var(--md-sys-color-outline-variant);
        font-size: 11px;
        color: var(--md-sys-color-on-surface-variant);
        opacity: 0.9;
    }

    &__refresh {
        @include button-reset;
        margin-left: auto;
        padding: 2px 6px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        color: var(--md-sys-color-primary);
        @include md-transition(background-color, var(--md-transition-fast));

        &:hover:not(:disabled) {
            background: var(--md-sys-color-primary-container);
        }

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
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
