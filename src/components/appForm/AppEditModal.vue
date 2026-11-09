<script setup lang="ts">
/**
 * AppEditModal - 添加/编辑网站表单
 *
 * 支持以下字段：
 * - 网站名称、网站链接（自动补全 https://）
 * - 所属分类（支持在表单内新建分类）
 * - 备注描述
 * - 图标（URL / 系统 SVG 名称，支持自动获取 favicon 与从 UI 库选择）
 * - 是否隐藏站点
 *
 * 依赖：useDataManager、useToast、ModalOverlay、BaseInput、BaseButton、IconSvg
 */
import { ref, computed, watch } from 'vue';
import ModalOverlay from '@/components/common/ModalOverlay.vue';
import BaseInput from '@/components/common/BaseInput.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import IconSvg from '@/components/icon/IconSvg.vue';
import HiddenTipModal from '@/components/appForm/HiddenTipModal.vue';
import { useDataManager } from '@/composables/useDataManager';
import { useToast } from '@/composables/useToast';
import { storageManager } from '@/services/storage.service';
import { STORAGE_KEYS } from '@/types/storage';
import { normalizeUrl } from '@/utils/url.util';
import type { AppItem, AppInput } from '@/types/app';

/** 新建分类选项的特殊值 */
const NEW_CATEGORY_VALUE = '__new__';

/** 默认图标占位 */
const DEFAULT_ICON = './image/icons/site.svg';

export interface AppEditModalProps {
    /** 是否显示模态框（支持 v-model） */
    modelValue: boolean;
    /** 编辑模式传入的应用；为 null 时为添加模式 */
    app?: AppItem | null;
    /** 添加模式时默认选中的分类 ID */
    initialCategoryId?: string;
}

const props = withDefaults(defineProps<AppEditModalProps>(), {
    app: null,
    initialCategoryId: '',
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    /** 保存成功后回传最终 AppItem */
    (e: 'saved', app: AppItem): void;
}>();

const {
    userCategories,
    uiItems,
    addCategory,
    addApp,
    updateApp,
    findAppByUrl,
    findCategoryByName,
    getCategoryById
} = useDataManager();
const { success, error } = useToast();

interface FormState {
    name: string;
    url: string;
    category: string;
    description: string;
    icon: string;
    hidden: boolean;
}

const form = ref<FormState>({
    name: '',
    url: '',
    category: '',
    description: '',
    icon: '',
    hidden: false,
});
const newCategoryName = ref('');
const errors = ref<Record<string, string>>({});
const isSubmitting = ref(false);
const showIconPicker = ref(false);
const hiddenTipOpen = ref(false);
/** 自动获取图标时是否请求高清图（favicon.im larger=true） */
const fetchLargerIcon = ref(false);

const isEdit = computed(() => !!props.app?.id);
const modalTitle = computed(() => (isEdit.value ? '编辑网站' : '添加网站'));
const isNewCategory = computed(() => form.value.category === NEW_CATEGORY_VALUE);
const effectiveIcon = computed(() => form.value.icon?.trim() || DEFAULT_ICON);
const categoryOptions = computed(() => userCategories.value);
const iconItems = computed(() => uiItems.value);

/**
 * 与当前输入 URL 指向同一站点的已有站点
 * 编辑模式排除自身，避免「改个名字也被判重」
 */
const duplicateApp = computed(() => {
    const url = form.value.url.trim();
    if (!url) return undefined;
    return findAppByUrl(url, props.app?.id);
});

/** 重复站点所在分类名 */
const duplicateCategoryName = computed(() => {
    const duplicate = duplicateApp.value;
    if (!duplicate) return '';
    return getCategoryById(duplicate.category)?.name ?? '未分类';
});

/** 根据 URL 生成 favicon 服务地址，larger 为 true 时请求高清图 */
function buildFaviconUrl(url: string, larger = false): string | null {
    try {
        const normalized = normalizeUrl(url);
        const urlObj = new URL(normalized);
        return `https://favicon.im/${urlObj.hostname}?l=${Date.now()}${larger ? '&larger=true' : ''}`;
    } catch {
        return null;
    }
}

/** 重置表单状态 */
function resetForm(): void {
    errors.value = {};
    showIconPicker.value = false;
    fetchLargerIcon.value = false;
    newCategoryName.value = '';

    if (props.app) {
        form.value = {
            name: props.app.name || '',
            url: props.app.url || '',
            category: props.app.category || '',
            description: props.app.description || '',
            icon: props.app.icon || '',
            hidden: props.app.hidden || false,
        };
    } else {
        form.value = {
            name: '',
            url: '',
            category: props.initialCategoryId || '',
            description: '',
            icon: '',
            hidden: false,
        };
    }
}

/** 关闭模态框 */
function close(): void {
    emit('update:modelValue', false);
}

/** 自动获取 favicon */
async function autoFetchIcon(): Promise<void> {
    const url = form.value.url.trim();
    if (!url) {
        error('请先输入网站链接');
        return;
    }
    const favicon = buildFaviconUrl(url, fetchLargerIcon.value);
    if (!favicon) {
        error('无法解析网站链接');
        return;
    }
    form.value.icon = favicon;
    success('图标已自动获取');
}

/** URL 输入框失焦且图标为空时自动获取图标 */
function handleUrlBlur(): void {
    if (!form.value.icon.trim() && form.value.url.trim()) {
        autoFetchIcon().catch(() => undefined);
    }
}

/** 清除图标 */
function clearIcon(): void {
    form.value.icon = '';
}

/** 从 UI 库选择图标 */
function selectIcon(url: string): void {
    form.value.icon = url;
    showIconPicker.value = false;
}

/** 表单校验 */
function validate(): boolean {
    errors.value = {};

    if (!form.value.name.trim()) {
        errors.value.name = '请输入网站名称';
    }

    const url = form.value.url.trim();
    if (!url) {
        errors.value.url = '请输入网站链接';
    } else {
        try {
            new URL(normalizeUrl(url));
        } catch {
            errors.value.url = '请输入有效的网址';
        }
        if (!errors.value.url && duplicateApp.value) {
            errors.value.url = `该网站已存在：${duplicateApp.value.name}（分类：${duplicateCategoryName.value}）`;
        }
    }

    if (!form.value.category) {
        errors.value.category = '请选择所属分类';
    }

    if (isNewCategory.value && !newCategoryName.value.trim()) {
        errors.value.newCategoryName = '请输入新分类名称';
    }

    const hasError = Object.keys(errors.value).length > 0;
    if (hasError) {
        error('请填写必填项');
    }
    return !hasError;
}

/** 提交表单 */
async function handleSubmit(): Promise<void> {
    if (!validate()) return;

    isSubmitting.value = true;
    try {
        let categoryId = form.value.category;

        if (categoryId === NEW_CATEGORY_VALUE) {
            // 同名分类已存在时直接复用，避免「新建分类」撞名报错
            const existing = findCategoryByName(newCategoryName.value);
            if (existing) {
                categoryId = existing.id;
            } else {
                const newCategory = await addCategory({ name: newCategoryName.value.trim() });
                categoryId = newCategory.id;
            }
        }

        const payload: AppInput = {
            name: form.value.name.trim(),
            url: normalizeUrl(form.value.url),
            category: categoryId,
            description: form.value.description.trim(),
            icon: form.value.icon.trim() || undefined,
            hidden: form.value.hidden,
        };

        let saved: AppItem;
        if (isEdit.value) {
            const result = await updateApp(props.app!.id, payload);
            if (!result) {
                throw new Error('应用不存在');
            }
            saved = result;
            success('网站已更新');
        } else {
            saved = await addApp(payload);
            success('网站已添加');
        }

        emit('saved', saved);
        close();
        if (saved.hidden) {
            void maybeShowHiddenTip();
        }
    } catch (err) {
        error(err instanceof Error ? err.message : '保存失败');
    } finally {
        isSubmitting.value = false;
    }
}

/**
 * 站点被设为隐藏后，弹出「显示/恢复隐藏方法」提示。
 * 用户已勾选「不再提示」时不再弹出；读取失败时默认提示（保守策略）。
 */
async function maybeShowHiddenTip(): Promise<void> {
    try {
        const dismissed = await storageManager.get(STORAGE_KEYS.HIDDEN_TIP_DISMISSED);
        if (!dismissed) {
            hiddenTipOpen.value = true;
        }
    } catch {
        hiddenTipOpen.value = true;
    }
}

watch(
    () => props.modelValue,
    (visible) => {
        if (visible) resetForm();
    },
    { immediate: true }
);

watch(
    () => props.app,
    () => {
        if (props.modelValue) resetForm();
    },
    { deep: true }
);
</script>

<template>
    <ModalOverlay
        :model-value="modelValue"
        :title="modalTitle"
        :max-width="520"
        close-on-overlay
        @update:model-value="$emit('update:modelValue', $event)"
    >
        <form class="app-edit-form" @submit.prevent="handleSubmit">
            <section class="form-section">
                <header class="form-section__header">
                    <IconSvg name="edit" :size="16" monochrome />
                    <h3 class="form-section__title">基本信息</h3>
                </header>

                <div class="form-group">
                    <BaseInput
                        v-model="form.name"
                        label="网站名称"
                        placeholder="例如：GitHub"
                        required
                        :error="errors.name"
                    />
                </div>

                <div class="form-group">
                    <BaseInput
                        v-model="form.url"
                        label="网站链接"
                        type="url"
                        placeholder="https://..."
                        required
                        hint="输入 URL 后失焦可自动获取图标，也可手动设置下方图标"
                        :error="errors.url"
                        @blur="handleUrlBlur"
                    />
                    <p v-if="duplicateApp && !errors.url" class="form-warning">
                        <IconSvg name="warning" :size="14" />
                        <span>
                            该网站已存在：{{ duplicateApp.name }}（分类：{{ duplicateCategoryName }}），同一站点不能重复添加
                        </span>
                    </p>
                </div>

                <div class="form-group">
                    <label class="form-label" for="app-edit-category">
                        所属分类
                        <span class="form-required" aria-hidden="true">*</span>
                    </label>
                    <select
                        id="app-edit-category"
                        v-model="form.category"
                        class="form-select"
                        :class="{ 'form-select--error': errors.category }"
                    >
                        <option value="" disabled>请选择分类</option>
                        <option
                            v-for="category in categoryOptions"
                            :key="category.id"
                            :value="category.id"
                        >
                            {{ category.name }}
                        </option>
                        <option :value="NEW_CATEGORY_VALUE">+ 新建分类</option>
                    </select>
                    <p v-if="errors.category" class="form-error">{{ errors.category }}</p>
                </div>

                <div v-if="isNewCategory" class="form-group">
                    <BaseInput
                        v-model="newCategoryName"
                        label="新分类名称"
                        placeholder="例如：学习资源"
                        required
                        :error="errors.newCategoryName"
                    />
                </div>

                <div class="form-group">
                    <BaseInput
                        v-model="form.description"
                        label="备注描述"
                        placeholder="简短描述网站用途..."
                    />
                </div>
            </section>

            <section class="form-section">
                <header class="form-section__header">
                    <IconSvg name="picture" :size="16" monochrome />
                    <h3 class="form-section__title">图标设置</h3>
                </header>

                <div class="icon-card">
                    <div class="icon-selector">
                        <div class="icon-preview">
                            <IconSvg
                                :src="effectiveIcon"
                                :size="36"
                                :fallback="DEFAULT_ICON"
                                alt="图标预览"
                            />
                        </div>
                        <div class="icon-input-group">
                            <BaseInput
                                v-model="form.icon"
                                placeholder="图标 URL 或系统图标名称"
                                :error="errors.icon"
                            />
                            <BaseButton
                                type="button"
                                variant="secondary"
                                size="small"
                                @click="showIconPicker = !showIconPicker"
                            >
                                <template #icon>
                                    <IconSvg name="picture" :size="16" monochrome />
                                </template>
                                选择
                            </BaseButton>
                        </div>
                    </div>

                    <div class="icon-actions">
                        <BaseButton
                            type="button"
                            variant="outlined"
                            size="small"
                            @click="autoFetchIcon"
                        >
                            <template #icon>
                                <IconSvg name="refresh" :size="14" monochrome />
                            </template>
                            自动获取图标
                        </BaseButton>
                        <BaseButton
                            type="button"
                            variant="text"
                            size="small"
                            @click="clearIcon"
                        >
                            清除
                        </BaseButton>
                        <label class="icon-larger-toggle">
                            <input v-model="fetchLargerIcon" type="checkbox" />
                            <span>获取高清图标</span>
                        </label>
                    </div>

                    <div v-if="showIconPicker" class="icon-picker">
                        <button
                            v-for="item in iconItems"
                            :key="item.id"
                            type="button"
                            class="icon-picker-item"
                            :title="item.name"
                            @click="selectIcon(item.url)"
                        >
                            <IconSvg
                                :src="item.url"
                                :size="22"
                                :fallback="DEFAULT_ICON"
                                :alt="item.name"
                            />
                        </button>
                    </div>
                </div>
            </section>

            <div class="form-group form-group--checkbox">
                <label class="checkbox-label">
                    <input v-model="form.hidden" type="checkbox" />
                    <span>隐藏该站点（默认不在首页显示）</span>
                </label>
            </div>
        </form>

        <template #footer>
            <BaseButton variant="text" @click="close">取消</BaseButton>
            <BaseButton
                variant="primary"
                type="button"
                :loading="isSubmitting"
                @click="handleSubmit"
            >
                保存
            </BaseButton>
        </template>
    </ModalOverlay>

    <HiddenTipModal v-model="hiddenTipOpen" />
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.app-edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-5);
}

// ==================== 表单区块 ====================
// 层级只靠底色差与发丝描边：区块头一条下划线，区块之间靠留白分隔
.form-section {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-3);

    &__header {
        display: flex;
        align-items: center;
        gap: var(--ui-space-2);
        padding-bottom: var(--ui-space-2);
        border-bottom: 1px solid var(--ui-hairline);
        // 图标走 currentColor（内置图标是 CSS mask），随标题一起弱化
        color: var(--ui-muted);
    }

    // 装饰性小标题：小字 + 放开字距 + 弱化色，不再抢主色
    &__title {
        @include ui-caption;
    }
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-2);

    &--checkbox {
        flex-direction: row;
        align-items: center;
    }
}

.form-label {
    display: flex;
    align-items: center;
    gap: var(--ui-space-1);
    font-size: var(--ui-font-small);
    font-weight: 600;
    letter-spacing: var(--ui-track-tight);
    color: var(--ui-ink);
}

.form-required {
    color: var(--ui-danger);
}

// 原生 select 与 BaseInput 对齐：同描边、同圆角、同焦点环
.form-select {
    width: 100%;
    min-height: 36px;
    padding: 0 var(--ui-space-3);
    border: 1px solid var(--ui-hairline-strong);
    border-radius: var(--ui-radius-md);
    background: var(--ui-panel);
    color: var(--ui-ink);
    font-size: var(--ui-font-body);
    font-family: inherit;
    outline: none;
    cursor: pointer;
    @include ui-transition(border-color);

    &:focus {
        border-color: var(--ui-accent);
        box-shadow: 0 0 0 3px var(--ui-accent-softer);
    }

    &--error {
        border-color: var(--ui-danger);
    }
}

.form-error {
    margin: 0;
    font-size: var(--ui-font-caption);
    line-height: 1.45;
    color: var(--ui-danger);
}

// 重复站点提示：中性提示块，用 tertiary 容器色与错误红区分
.form-warning {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-2);
    margin: 0;
    padding: var(--ui-space-2) var(--ui-space-3);
    border: 1px solid color-mix(in srgb, var(--md-sys-color-tertiary) 28%, transparent);
    border-radius: var(--ui-radius-md);
    background: var(--md-sys-color-tertiary-container);
    color: var(--md-sys-color-on-tertiary-container);
    font-size: var(--ui-font-caption);
    line-height: 1.5;

    :deep(.icon-svg) {
        margin-top: 1px;
        flex-shrink: 0;
        color: inherit;
    }
}

// ==================== 图标设置 ====================
// 卡片比弹窗表面深一档，内部控件再浅回来，形成「升 - 降 - 升」的层次
.icon-card {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-3);
    padding: var(--ui-space-3);
    @include ui-surface(var(--ui-elevated), var(--ui-radius-lg));
}

.icon-selector {
    display: flex;
    align-items: center;
    gap: var(--ui-space-3);
}

.icon-preview {
    @include flex-center(row, 0);
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    border: 1px solid var(--ui-hairline);
    border-radius: var(--ui-radius-lg);
    background: var(--ui-panel);
    color: var(--ui-muted);
}

.icon-input-group {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--ui-space-2);

    :deep(.mnt-base-input) {
        flex: 1;
    }
}

.icon-actions {
    display: flex;
    align-items: center;
    gap: var(--ui-space-2);
}

.icon-larger-toggle {
    display: flex;
    align-items: center;
    gap: var(--ui-space-1);
    margin-left: auto;
    font-size: var(--ui-font-small);
    color: var(--ui-muted);
    cursor: pointer;
    @include ui-transition(color);

    &:hover {
        color: var(--ui-ink);
    }

    input[type='checkbox'] {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: var(--ui-accent);
    }
}

// 图标网格：凹陷井底，格子本身回到面板色，形成「井 - 砖」的层次
.icon-picker {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: var(--ui-space-2);
    max-height: 140px;
    overflow-y: auto;
    padding: var(--ui-space-2);
    border: 1px solid var(--ui-hairline);
    border-radius: var(--ui-radius-md);
    background: var(--ui-sunken);
    @include hide-scrollbar;
}

.icon-picker-item {
    @include button-reset;
    @include flex-center(row, 0);
    @include ui-interactive;
    @include ui-focus-ring;
    width: 40px;
    height: 40px;
    border: 1px solid var(--ui-hairline);
    border-radius: var(--ui-radius-md);
    background: var(--ui-panel);
    color: var(--ui-muted);

    &:hover {
        border-color: var(--ui-hairline-strong);
    }
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--ui-space-2);
    font-size: var(--ui-font-body);
    color: var(--ui-body);
    cursor: pointer;

    input[type='checkbox'] {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: var(--ui-accent);
    }
}

// 底色 / 描边 / 文字全部由 --ui-* 按当前主题派生，深色主题无需另写一套覆盖

@include respond-to(mobile) {
    .icon-picker {
        grid-template-columns: repeat(5, 1fr);
    }
}
</style>
