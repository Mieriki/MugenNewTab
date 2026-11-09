<script setup lang="ts">
/**
 * CloudSyncPanel - 设置中心的「数据与同步」栏目
 *
 * 按「分组 + 行」组织成两个分组：
 *   1. 云同步：连接状态、Token 登录（GitHub / Gitee）、自动同步与手动同步；
 *   2. 浏览器同步：把 Token 加密后写进浏览器账号同步区（storage.sync），
 *      让同一浏览器账号的其他设备免 Token 登录，再自动拉取 Gist 数据。
 *
 * 两条路径互补：云同步负责数据本体（Gist），浏览器同步只负责把「登录凭据」
 * 迁移到其他设备。浏览器同步分组在未登录 / 已登录两种状态下都常驻显示：
 * 未登录时可以先设密码（登录后自动补推凭据），也可以凭密码恢复其他设备的登录状态。
 *
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
import BaseSwitch from '@/components/common/BaseSwitch.vue';
import SettingsSection from '@/components/settings/SettingsSection.vue';
import SettingsRow from '@/components/settings/SettingsRow.vue';

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

/** 自动同步开关（BaseSwitch 直接给出布尔值） */
async function handleAutoSyncChange(value: boolean): Promise<void> {
    try {
        await setAutoSync(value);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emit('error', message);
    }
}

/** 勾选「开启浏览器同步」：展开密码输入 */
function handleBrowserToggle(value: boolean): void {
    browserExpanded.value = value;
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
        <!-- ============ 云同步：登录、同步 ============ -->
        <SettingsSection
            :title="title"
            description="使用 GitHub / Gitee 代码片段（Gist）备份和同步你的站点数据，Token 只保存在本机。"
        >
            <SettingsRow label="连接状态">
                <template #icon>
                    <IconSvg name="cloud" :size="16" />
                </template>
                <template #actions>
                    <span class="cloud-sync-panel__status" :class="statusClass">{{ statusText }}</span>
                </template>
            </SettingsRow>

            <SettingsRow v-if="error" label="同步失败" stacked>
                <template #actions>
                    <p class="cloud-sync-panel__error" role="alert">{{ error }}</p>
                </template>
            </SettingsRow>

            <template v-if="!isLoggedIn">
                <SettingsRow
                    label="同步平台"
                    description="选择代码片段所在的平台，切换后需要重新填写 Token"
                >
                    <template #actions>
                        <div class="cloud-sync-provider" role="radiogroup" aria-label="同步平台">
                            <button
                                v-for="option in PROVIDER_OPTIONS"
                                :key="option.id"
                                type="button"
                                role="radio"
                                class="cloud-sync-provider__btn"
                                :class="{ 'is-active': selectedProvider === option.id }"
                                :aria-checked="selectedProvider === option.id"
                                :disabled="isLoading"
                                @click="selectedProvider = option.id"
                            >
                                {{ option.name }}
                            </button>
                        </div>
                    </template>
                </SettingsRow>

                <SettingsRow class="cloud-sync-panel__guest" label="访问令牌" stacked>
                    <template #actions>
                        <div class="cloud-sync-panel__token">
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
                                    <IconSvg name="link" :size="14" />
                                </template>
                                连接 {{ currentProviderOption.name }}
                            </BaseButton>
                        </div>
                    </template>
                </SettingsRow>
            </template>

            <template v-else>
                <SettingsRow
                    v-if="userInfo"
                    class="cloud-sync-user"
                    :label="userInfo.login"
                    :description="`上次同步：${formattedLastSyncTime}`"
                >
                    <template #icon>
                        <img
                            :src="userInfo.avatar"
                            alt=""
                            class="cloud-sync-user__avatar"
                            loading="lazy"
                        />
                    </template>
                </SettingsRow>

                <SettingsRow
                    label="自动同步"
                    description="站点数据变化后自动上传，多端增量合并"
                >
                    <template #actions>
                        <BaseSwitch
                            :model-value="autoSync"
                            :disabled="isLoading"
                            aria-label="自动同步"
                            @update:model-value="handleAutoSyncChange"
                        />
                    </template>
                </SettingsRow>

                <SettingsRow
                    label="手动同步"
                    description="立即同步会双向合并，强制恢复云端会丢弃本地改动"
                >
                    <template #actions>
                        <div class="cloud-sync-actions">
                            <BaseButton
                                variant="primary"
                                size="small"
                                :loading="isLoading"
                                @click="handleSync"
                            >
                                <template #icon>
                                    <IconSvg name="upload" :size="14" />
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
                                    <IconSvg name="download" :size="14" />
                                </template>
                                强制恢复云端
                            </BaseButton>
                        </div>
                    </template>
                </SettingsRow>

                <SettingsRow
                    label="断开连接"
                    description="只清除本机保存的 Token，代码片段里的数据不受影响"
                >
                    <template #actions>
                        <BaseButton
                            variant="ghost"
                            size="small"
                            class="cloud-sync-logout"
                            :loading="isLoading"
                            @click="handleLogout"
                        >
                            <template #icon>
                                <IconSvg name="logout" :size="14" />
                            </template>
                            断开连接
                        </BaseButton>
                    </template>
                </SettingsRow>
            </template>
        </SettingsSection>

        <!-- ============ 浏览器同步（始终可见） ============ -->
        <SettingsSection
            class="cloud-sync-cross"
            title="浏览器同步"
            description="登录同一浏览器账号的其他设备，输入同步密码即可免 Token 登录。同步区只保存 AES-GCM 密文。"
        >
            <SettingsRow
                v-if="browserMode === 'off' || browserMode === 'setup'"
                label="开启浏览器同步"
                description="把登录状态加密后写进浏览器账号同步区"
            >
                <template #icon>
                    <IconSvg :paths="LOCK_PATHS" :size="16" />
                </template>
                <template #actions>
                    <BaseSwitch
                        :model-value="browserMode === 'setup'"
                        :disabled="isLoading || browserBusy"
                        aria-label="开启浏览器同步"
                        @update:model-value="handleBrowserToggle"
                    />
                </template>
            </SettingsRow>

            <SettingsRow
                v-if="browserMode !== 'off' && browserMode !== 'setup'"
                label="同步状态"
                :description="browserStatusText"
            >
                <template #icon>
                    <IconSvg :paths="LOCK_PATHS" :size="16" />
                </template>
                <template v-if="browserMode === 'enabled'" #actions>
                    <span class="cloud-sync-cross__badge">已开启</span>
                </template>
            </SettingsRow>

            <SettingsRow
                v-if="!syncAreaNative"
                label="运行环境"
                description="当前为网页预览环境，无法写入浏览器账号同步区，该功能仅在扩展中生效。"
            />

            <SettingsRow
                v-if="browserNeedsPassphrase"
                label="设置同步密码"
                :description="browserHint"
                stacked
            >
                <template #actions>
                    <div class="cloud-sync-cross__form">
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
                                <IconSvg :paths="LOCK_PATHS" :size="14" />
                            </template>
                            {{ browserActionLabel }}
                        </BaseButton>
                    </div>
                </template>
            </SettingsRow>

            <SettingsRow
                v-if="browserMode === 'restore'"
                label="没有旧密码？"
                description="直接在本机开启新的浏览器同步，不用其他设备的旧密码"
            >
                <template #actions>
                    <BaseButton
                        variant="ghost"
                        size="small"
                        class="cloud-sync-cross__skip"
                        :disabled="browserBusy"
                        @click="handleSkipRestore"
                    >
                        直接开启
                    </BaseButton>
                </template>
            </SettingsRow>

            <SettingsRow
                v-if="browserMode === 'enabled'"
                label="同步密码管理"
                description="更新密码会用新密码重新加密并覆盖同步区里的旧密文"
            >
                <template #actions>
                    <div class="cloud-sync-cross__actions">
                        <BaseButton
                            variant="text"
                            size="small"
                            :disabled="browserBusy"
                            @click="browserExpanded = !browserExpanded"
                        >
                            {{ browserExpanded ? '收起' : '更新密码' }}
                        </BaseButton>
                        <BaseButton
                            variant="ghost"
                            size="small"
                            :disabled="browserBusy"
                            @click="handleDisableBrowserSync"
                        >
                            关闭浏览器同步
                        </BaseButton>
                    </div>
                </template>
            </SettingsRow>

            <!-- 同步区诊断：让「到底同步到了没」可见，而不是靠猜 -->
            <SettingsRow label="同步区诊断">
                <template #description>
                    <span class="cloud-sync-cross__diag">
                        <span :title="extensionId ? `扩展 ID：${extensionId}` : ''">
                            同步区：{{ syncAreaNative ? '浏览器账号' : '本机模拟' }}
                        </span>
                        <span>凭据：{{ crossDeviceRemoteAvailable ? remoteMetaText : '暂无' }}</span>
                    </span>
                </template>
                <template #actions>
                    <BaseButton
                        variant="ghost"
                        size="small"
                        class="cloud-sync-cross__refresh"
                        :disabled="browserBusy"
                        @click="handleRefreshSyncArea"
                    >
                        重新检查
                    </BaseButton>
                </template>
            </SettingsRow>

            <SettingsRow
                v-if="syncAreaNative && !crossDeviceRemoteAvailable && !isLoggedIn"
                label="同步提示"
                stacked
            >
                <template #description>
                    <p class="cloud-sync-cross__warn">
                        <template v-if="isFirefox">
                            Firefox 需在「设置 → 同步」勾选「附加组件」，且每 10 分钟或点「立即同步」才会把同步区数据传到另一台设备。
                        </template>
                        <template v-else>
                            两台设备需登录同一个浏览器账号并开启同步，数据才会在同步区之间流转。
                        </template>
                    </p>
                </template>
            </SettingsRow>
        </SettingsSection>
    </section>
</template>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.cloud-sync-panel {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-5);

    // 连接状态：胶囊标签，连上 / 加载中用主色淡底
    &__status {
        display: inline-flex;
        align-items: center;
        padding: 2px var(--ui-space-2);
        border-radius: var(--ui-radius-pill);
        background: var(--ui-sunken);
        color: var(--ui-muted);
        font-size: var(--ui-font-caption);
        font-weight: 500;
        white-space: nowrap;
        @include ui-transition(background-color, color);

        &.is-connected {
            background: var(--ui-accent-soft);
            color: var(--ui-accent);
        }

        &.is-loading {
            background: var(--ui-accent-softer);
            color: var(--ui-accent);
        }
    }

    // 错误提示：占满整行，不与行标题抢横向空间
    &__error {
        width: 100%;
        margin: 0;
        padding: var(--ui-space-2) var(--ui-space-3);
        border-radius: var(--ui-radius-md);
        background: var(--ui-danger-soft);
        color: var(--ui-danger);
        font-size: var(--ui-font-caption);
        line-height: 1.45;
    }

    // 说明文字：跟在控件下方的补充说明
    &__hint {
        margin: 0;
        @include ui-description;
        color: var(--ui-muted-soft);
    }

    // 未登录：Token 输入 + 说明 + 连接按钮纵向排布，占满行宽
    &__token {
        display: flex;
        flex-direction: column;
        gap: var(--ui-space-2);
        width: 100%;
    }
}

// ==================== 已登录：用户信息 ====================
.cloud-sync-user {
    &__avatar {
        width: 28px;
        height: 28px;
        border-radius: var(--ui-radius-pill);
        object-fit: cover;
        background: var(--ui-sunken);
        flex-shrink: 0;
    }
}

// ==================== 平台选择（分段控件外观） ====================
.cloud-sync-provider {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--ui-hairline);
    border-radius: var(--ui-radius-md);
    background: var(--ui-sunken);

    &__btn {
        @include button-reset;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 26px;
        padding: 0 var(--ui-space-3);
        border: 1px solid transparent;
        border-radius: var(--ui-radius-sm);
        font-size: var(--ui-font-small);
        font-weight: 500;
        color: var(--ui-muted);
        white-space: nowrap;
        @include ui-transition(background-color, color);
        @include ui-focus-ring;

        &:hover:not(.is-active):not(:disabled) {
            color: var(--ui-ink);
        }

        // 选中块浮在轨道上：靠底色 + 发丝描边 + 一级微阴影，不做位移
        &.is-active {
            background: var(--ui-panel);
            border-color: var(--ui-hairline);
            color: var(--ui-ink);
            box-shadow: var(--ui-shadow-1);
        }

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }
}

// ==================== 手动同步 ====================
.cloud-sync-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-2);
}

.cloud-sync-logout {
    color: var(--ui-danger);
}

// ==================== 浏览器同步 ====================
// 分组的边框 / 底色由 SettingsSection 负责，这里只描述行内的控件
.cloud-sync-cross {
    &__badge {
        display: inline-flex;
        align-items: center;
        padding: 1px var(--ui-space-2);
        border-radius: var(--ui-radius-pill);
        background: var(--ui-accent-soft);
        color: var(--ui-accent);
        font-size: var(--ui-font-micro);
        font-weight: 600;
        white-space: nowrap;
    }

    // 密码输入 + 提交按钮：纵向排布，占满行宽
    &__form {
        display: flex;
        flex-direction: column;
        gap: var(--ui-space-2);
        width: 100%;
    }

    &__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ui-space-2);
    }

    // 同步区诊断：两段等宽弱化的元信息
    &__diag {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ui-space-1) var(--ui-space-3);
        @include ui-description;
        color: var(--ui-muted-soft);
    }

    &__warn {
        margin: 0;
        @include ui-description;
        color: var(--ui-muted-soft);
    }
}
</style>
