<script setup lang="ts">
/**
 * PopupApp.vue - 浏览器扩展 popup 根组件
 *
 * 自动读取当前活动标签页信息，提供快速添加网站到 MugenNewTab 的表单。
 */
import { computed, ref, watch } from 'vue';
import { useDataManager } from '@/composables/useDataManager';
import { useCurrentTab } from '@/composables/useCurrentTab';
import { useToast } from '@/composables/useToast';
import { browserApi } from '@/services/browserApi.service';

import BaseInput from '@/components/common/BaseInput.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import IconSvg from '@/components/icon/IconSvg.vue';

const NEW_CATEGORY_VALUE = '__new__';
const DEFAULT_ICON = './image/icons/picture.svg';
const HOME_PAGE_URL = 'https://github.com/MugenNewTab/MugenNewTab';

const dataManager = useDataManager({ autoInit: true });
const { title: tabTitle, url: tabUrl, favicon, isValid, isLoading } = useCurrentTab({ autoRefresh: true });
const toast = useToast();

interface FormState {
    name: string;
    url: string;
    category: string;
    newCategoryName: string;
    description: string;
    icon: string;
}

const form = ref<FormState>({
    name: '',
    url: '',
    category: '',
    newCategoryName: '',
    description: '',
    icon: '',
});

const errors = ref<Record<string, string>>({});
const isSubmitting = ref(false);

const isNewCategory = computed(() => form.value.category === NEW_CATEGORY_VALUE);
const categoryOptions = computed(() => dataManager.userCategories.value);
const effectiveIcon = computed(() => form.value.icon?.trim() || DEFAULT_ICON);

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

/** 自动获取 favicon */
async function autoFetchIcon(): Promise<void> {
    const url = form.value.url.trim();
    if (!url) {
        toast.error('请先输入网站链接');
        return;
    }
    const favicon = buildFaviconUrl(url);
    if (!favicon) {
        toast.error('无法解析网站链接');
        return;
    }
    form.value.icon = favicon;
    toast.success('图标已自动获取');
}

/** URL 失焦且图标为空时自动获取图标 */
function handleUrlBlur(): void {
    if (!form.value.icon.trim() && form.value.url.trim()) {
        autoFetchIcon().catch(() => undefined);
    }
}

/** 清除图标 */
function clearIcon(): void {
    form.value.icon = '';
}

/** 重置表单 */
function resetForm(): void {
    errors.value = {};
    form.value = {
        name: tabTitle.value,
        url: tabUrl.value,
        category: '',
        newCategoryName: '',
        description: '',
        icon: favicon.value,
    };
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

    if (isNewCategory.value && !form.value.newCategoryName.trim()) {
        errors.value.newCategoryName = '请输入新分类名称';
    }

    const hasError = Object.keys(errors.value).length > 0;
    if (hasError) {
        toast.error('请填写必填项');
    }
    return !hasError;
}

/** 保存网站 */
async function handleSubmit(): Promise<void> {
    if (!validate()) return;

    isSubmitting.value = true;
    try {
        let categoryId = form.value.category;

        if (categoryId === NEW_CATEGORY_VALUE) {
            const newCategory = await dataManager.addCategory({
                name: form.value.newCategoryName.trim(),
            });
            categoryId = newCategory.id;
        }

        const saved = await dataManager.addApp({
            name: form.value.name.trim(),
            url: normalizeUrl(form.value.url),
            category: categoryId,
            description: form.value.description.trim(),
            icon: form.value.icon.trim() || undefined,
        });

        toast.success('网站已添加');
        // 延迟关闭 popup
        setTimeout(() => {
            window.close();
        }, 600);

        // 向父页面发送消息，通知添加成功
        if (browserApi.isExtension) {
            try {
                window.parent.postMessage({ type: 'mugen-app-added', app: saved }, '*');
            } catch {
                // 忽略跨域消息发送失败
            }
        }
    } catch (error) {
        toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
        isSubmitting.value = false;
    }
}

/** 打开主页 */
function openHomePage(): void {
    window.open(HOME_PAGE_URL, '_blank');
}

// 监听当前标签页变化，自动填充
watch(
    () => [tabTitle.value, tabUrl.value, favicon.value],
    () => {
        if (isValid.value) {
            resetForm();
        }
    },
    { immediate: true }
);

// 数据初始化完成后，若分类列表只有默认分类则默认选中第一个
watch(
    () => dataManager.userCategories.value.length,
    (length) => {
        if (length > 0 && !form.value.category) {
            form.value.category = dataManager.userCategories.value[0].id;
        }
    }
);
</script>

<template>
    <div id="popup-root" class="popup-root">
        <header class="popup-header">
            <div class="popup-brand" @click="openHomePage">
                <img src="/image/logo/mugen.png" alt="Mugen" class="popup-logo" />
                <span class="popup-title">添加到 Mugen新标签页</span>
            </div>
        </header>

        <main class="popup-body">
            <div v-if="isLoading" class="popup-state">
                <IconSvg name="refresh" :size="24" />
                <p>读取当前标签页…</p>
            </div>

            <div v-else-if="!isValid" class="popup-state popup-state--error">
                <IconSvg name="warning" :size="24" />
                <p>当前页面无法添加</p>
                <span class="popup-state-hint">不支持 chrome://、about: 等浏览器内部页面</span>
            </div>

            <form v-else class="popup-form" @submit.prevent="handleSubmit">
                <BaseInput
                    v-model="form.name"
                    label="网站名称"
                    placeholder="例如：GitHub"
                    required
                    :error="errors.name"
                />

                <BaseInput
                    v-model="form.url"
                    label="网站链接"
                    type="url"
                    placeholder="https://..."
                    required
                    :error="errors.url"
                    @blur="handleUrlBlur"
                />

                <div class="form-group">
                    <label class="form-label" for="popup-category">
                        所属分类
                        <span class="form-required" aria-hidden="true">*</span>
                    </label>
                    <select
                        id="popup-category"
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

                <BaseInput
                    v-if="isNewCategory"
                    v-model="form.newCategoryName"
                    label="新分类名称"
                    placeholder="例如：学习资源"
                    required
                    :error="errors.newCategoryName"
                />

                <BaseInput
                    v-model="form.description"
                    label="备注描述"
                    placeholder="简短描述网站用途..."
                />

                <div class="form-group">
                    <label class="form-label">图标预览</label>
                    <div class="icon-selector">
                        <div class="icon-preview">
                            <IconSvg
                                :src="effectiveIcon"
                                :size="32"
                                :fallback="DEFAULT_ICON"
                                alt="图标预览"
                            />
                        </div>
                        <BaseInput
                            v-model="form.icon"
                            placeholder="图标 URL 或系统图标名称"
                            class="icon-input"
                        />
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
                            自动获取
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
                </div>
            </form>
        </main>

        <footer class="popup-footer">
            <BaseButton variant="text" size="small" @click="resetForm">
                重置
            </BaseButton>
            <BaseButton
                variant="primary"
                size="small"
                :loading="isSubmitting"
                :disabled="!isValid || isSubmitting"
                @click="handleSubmit"
            >
                保存网站
            </BaseButton>
        </footer>
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.popup-root {
    width: 360px;
    min-height: 240px;
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.popup-header {
    padding: 14px 16px;
    background: linear-gradient(
        135deg,
        var(--md-sys-color-primary) 0%,
        var(--md-sys-color-secondary) 100%
    );
}

.popup-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
}

.popup-logo {
    width: 28px;
    height: 28px;
    object-fit: contain;
    border-radius: 6px;
}

.popup-title {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
}

.popup-body {
    flex: 1;
    padding: 16px;
    display: flex;
    flex-direction: column;
}

.popup-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.popup-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px 16px;
    color: var(--md-sys-color-on-surface-variant);
    text-align: center;

    &--error {
        color: var(--md-sys-color-error);
    }
}

.popup-state-hint {
    font-size: 12px;
    color: var(--md-sys-color-on-surface-variant);
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
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
    gap: 10px;
}

.icon-preview {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 10px;
    background: var(--md-sys-color-surface-variant);
    border: 1px solid var(--md-sys-color-outline);
    @include flex-center(row, 0);
}

.icon-input {
    flex: 1;
}

.icon-actions {
    display: flex;
    gap: 8px;
    margin-top: 2px;
}

.popup-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--md-sys-color-outline-variant);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

// 深色模式覆盖
:global(html.dark-mode),
:global(body.dark-mode) {
    .popup-root {
        background: rgba(40, 40, 40, 0.98);
    }

    .form-select {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.08);
    }
}
</style>
