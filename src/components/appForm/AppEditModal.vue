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
import type { AppItem, AppInput } from '@/types/app';

/** 新建分类选项的特殊值 */
const NEW_CATEGORY_VALUE = '__new__';

/** 默认图标占位 */
const DEFAULT_ICON = './image/icons/picture.svg';

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

const { userCategories, uiItems, addCategory, addApp, updateApp } = useDataManager();
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

const isEdit = computed(() => !!props.app?.id);
const modalTitle = computed(() => (isEdit.value ? '编辑网站' : '添加网站'));
const isNewCategory = computed(() => form.value.category === NEW_CATEGORY_VALUE);
const effectiveIcon = computed(() => form.value.icon?.trim() || DEFAULT_ICON);
const categoryOptions = computed(() => userCategories.value);
const iconItems = computed(() => uiItems.value);

/** 补全 URL 协议 */
function normalizeUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
}

/** 根据 URL 生成 favicon 服务地址 */
function buildFaviconUrl(url: string): string | null {
    try {
        const normalized = normalizeUrl(url);
        const urlObj = new URL(normalized);
        return `https://favicon.im/${urlObj.hostname}?l=${Date.now()}`;
    } catch {
        return null;
    }
}

/** 重置表单状态 */
function resetForm(): void {
    errors.value = {};
    showIconPicker.value = false;
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
    const favicon = buildFaviconUrl(url);
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
            const newCategory = await addCategory({ name: newCategoryName.value.trim() });
            categoryId = newCategory.id;
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

            <div class="form-group">
                <label class="form-label">图标设置</label>
                <div class="icon-selector">
                    <div class="icon-preview">
                        <IconSvg
                            :src="effectiveIcon"
                            :size="32"
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
                                <IconSvg name="picture" :size="16" />
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
                            <IconSvg name="refresh" :size="14" />
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
    gap: 18px;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;

    &--checkbox {
        flex-direction: row;
        align-items: center;
        gap: 8px;
    }
}

.form-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--md-sys-color-on-surface);
}

.form-required {
    color: var(--md-sys-color-error);
}

.form-select {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--md-sys-color-outline);
    border-radius: 10px;
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    font-size: 14px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
    @include md-transition(border-color, var(--md-transition-fast));

    &:focus {
        border-color: var(--md-sys-color-primary);
        box-shadow: 0 0 0 3px rgba(177, 74, 107, 0.08);
    }

    &--error {
        border-color: var(--md-sys-color-error);
    }
}

.form-error {
    margin: 0;
    font-size: 12px;
    color: var(--md-sys-color-error);
    line-height: 1.4;
}

.icon-selector {
    display: flex;
    align-items: center;
    gap: 12px;
}

.icon-preview {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 10px;
    background: var(--md-sys-color-surface-variant);
    border: 1px solid var(--md-sys-color-outline);
    @include flex-center(row, 0);
}

.icon-input-group {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;

    :deep(.mnt-base-input) {
        flex: 1;
    }
}

.icon-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
}

.icon-picker {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    max-height: 140px;
    overflow-y: auto;
    padding: 8px;
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: 10px;
    background: var(--md-sys-color-surface-variant);
    margin-top: 4px;
}

.icon-picker-item {
    @include button-reset;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: var(--md-sys-color-surface);
    border: 1px solid var(--md-sys-color-outline);
    @include flex-center(row, 0);
    @include md-transition(all, var(--md-transition-fast));
    @include focus-ring;

    &:hover {
        border-color: var(--md-sys-color-primary);
        background: var(--md-sys-color-primary-container);
    }
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: var(--md-sys-color-on-surface-variant);

    input[type='checkbox'] {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: var(--md-sys-color-primary);
    }
}

// 深色模式覆盖
:global(html.dark-mode),
:global(body.dark-mode) {
    .form-select {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.08);
    }

    .icon-picker {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.08);
    }

    .icon-picker-item {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.08);
    }
}

@include respond-to(mobile) {
    .icon-picker {
        grid-template-columns: repeat(5, 1fr);
    }
}
</style>
