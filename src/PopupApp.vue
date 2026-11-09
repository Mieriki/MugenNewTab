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
import { getSystemIconUrl } from '@/utils/image.util';
import { getBrandLogo } from '@/utils/browser.util';
import { normalizeUrl } from '@/utils/url.util';

import BaseInput from '@/components/common/BaseInput.vue';
import BaseButton from '@/components/common/BaseButton.vue';
import ToastContainer from '@/components/common/ToastContainer.vue';
import IconSvg from '@/components/icon/IconSvg.vue';

const NEW_CATEGORY_VALUE = '__new__';
// 须用绝对路径：popup 页面位于 view/ 子目录，相对路径会解析为 view/image/... 导致 404
const DEFAULT_ICON = getSystemIconUrl('picture');
const HOME_PAGE_URL = 'https://github.com/MugenNewTab/MugenNewTab';
/** 品牌 Logo（全浏览器统一使用 logo_girl） */
const brandLogo = getBrandLogo();

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
/** 自动获取图标时是否请求高清图（favicon.im larger=true） */
const fetchLargerIcon = ref(false);

const isNewCategory = computed(() => form.value.category === NEW_CATEGORY_VALUE);
const categoryOptions = computed(() => dataManager.userCategories.value);
const effectiveIcon = computed(() => form.value.icon?.trim() || DEFAULT_ICON);

/** 当前标签页网址是否已经在导航里 */
const duplicateApp = computed(() => {
    const url = form.value.url.trim();
    if (!url) return undefined;
    return dataManager.findAppByUrl(url);
});

/** 重复站点所在分类名 */
const duplicateCategoryName = computed(() => {
    const duplicate = duplicateApp.value;
    if (!duplicate) return '';
    return dataManager.getCategoryById(duplicate.category)?.name ?? '未分类';
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

/** 自动获取 favicon */
async function autoFetchIcon(): Promise<void> {
    const url = form.value.url.trim();
    if (!url) {
        toast.error('请先输入网站链接');
        return;
    }
    const favicon = buildFaviconUrl(url, fetchLargerIcon.value);
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
    fetchLargerIcon.value = false;
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
        if (!errors.value.url && duplicateApp.value) {
            errors.value.url = `该网站已存在：${duplicateApp.value.name}（分类：${duplicateCategoryName.value}）`;
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
            // 同名分类已存在时直接复用，避免「新建分类」撞名报错
            const existing = dataManager.findCategoryByName(form.value.newCategoryName);
            if (existing) {
                categoryId = existing.id;
            } else {
                const newCategory = await dataManager.addCategory({
                    name: form.value.newCategoryName.trim(),
                });
                categoryId = newCategory.id;
            }
        }

        const saved = await dataManager.addApp({
            name: form.value.name.trim(),
            url: normalizeUrl(form.value.url),
            category: categoryId,
            description: form.value.description.trim(),
            icon: form.value.icon.trim() || undefined,
        });

        toast.success('网站已添加');
        // 延迟关闭 popup，给用户留出看到成功提示的时间
        setTimeout(() => {
            window.close();
        }, 1500);

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
                <img :src="brandLogo" alt="Mugen" class="popup-logo" />
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

                <p v-if="duplicateApp && !errors.url" class="popup-warning">
                    <IconSvg name="warning" :size="14" />
                    <span>
                        该网站已存在：{{ duplicateApp.name }}（分类：{{ duplicateCategoryName }}），无需重复添加
                    </span>
                </p>

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
                        <label class="icon-larger-toggle">
                            <input v-model="fetchLargerIcon" type="checkbox" />
                            <span>高清图标</span>
                        </label>
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

        <ToastContainer position="top-right" />
    </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.popup-root {
    width: 360px;
    min-height: 240px;
    background: var(--ui-canvas);
    color: var(--ui-ink);
    display: flex;
    flex-direction: column;
    border-radius: var(--ui-radius-lg);
    overflow: hidden;
    box-shadow: var(--ui-shadow-2);
}

// 顶部主色渐变是品牌元素，保留；但把渐变收窄成同色系明度差，
// 不再从主色横向拉到次要色，避免整条头变成一块色板
.popup-header {
    padding: var(--ui-space-3) var(--ui-space-4);
    background: linear-gradient(
        135deg,
        var(--ui-accent) 0%,
        color-mix(in srgb, var(--ui-accent) 74%, var(--md-sys-color-secondary)) 100%
    );
}

.popup-brand {
    display: flex;
    align-items: center;
    gap: var(--ui-space-2);
    cursor: pointer;
}

// 品牌图自带白底：原图直出，只做圆角，不加内边距/边框/投影
.popup-logo {
    width: 32px;
    height: 32px;
    object-fit: contain;
    border-radius: var(--ui-radius-md);
    flex-shrink: 0;
}

.popup-title {
    font-size: var(--ui-font-title);
    font-weight: 600;
    letter-spacing: var(--ui-track-tight);
    // 头部是主色渐变，文字固定取配套的 on-accent
    color: var(--ui-on-accent);
}

.popup-body {
    flex: 1;
    padding: var(--ui-space-4);
    display: flex;
    flex-direction: column;
}

.popup-form {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-3);
}

.popup-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-2);
    padding: var(--ui-space-6) var(--ui-space-4);
    color: var(--ui-muted);
    text-align: center;

    &--error {
        color: var(--ui-danger);
    }
}

.popup-state-hint {
    font-size: var(--ui-font-caption);
    color: var(--ui-muted-soft);
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-1);
}

.form-label {
    display: flex;
    align-items: center;
    gap: var(--ui-space-1);
    font-size: var(--ui-font-small);
    font-weight: 500;
    letter-spacing: var(--ui-track-tight);
    color: var(--ui-ink);
}

.form-required {
    color: var(--ui-danger);
}

// 与 BaseInput 的外框对齐：同底色、同描边、同圆角、同最小高度
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
    transition:
        border-color var(--ui-dur-fast) var(--ui-ease),
        box-shadow var(--ui-dur-fast) var(--ui-ease);

    // 焦点：描边转主色 + 柔和光环，与 BaseInput 同一套
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
    line-height: 1.4;
    color: var(--ui-danger);
}

// 重复站点提示：语义色块，不再是半透明黄底
.popup-warning {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-1);
    margin: 0;
    padding: var(--ui-space-2) var(--ui-space-3);
    border-radius: var(--ui-radius-md);
    border: 1px solid color-mix(in srgb, var(--md-sys-color-tertiary) 22%, transparent);
    font-size: var(--ui-font-caption);
    line-height: 1.5;
    color: var(--md-sys-color-on-tertiary-container);
    background: var(--md-sys-color-tertiary-container);

    :deep(.icon-svg) {
        margin-top: 1px;
        flex-shrink: 0;
        color: inherit;
    }
}

.icon-selector {
    display: flex;
    align-items: center;
    gap: var(--ui-space-2);
}

.icon-preview {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: var(--ui-radius-md);
    background: var(--ui-sunken);
    border: 1px solid var(--ui-hairline);
    @include flex-center(row, 0);
}

.icon-input {
    flex: 1;
}

.icon-actions {
    display: flex;
    gap: var(--ui-space-2);
    margin-top: 2px;
    align-items: center;
}

.icon-larger-toggle {
    display: flex;
    align-items: center;
    gap: var(--ui-space-1);
    font-size: var(--ui-font-small);
    color: var(--ui-ink);
    cursor: pointer;
    margin-left: auto;

    input[type='checkbox'] {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: var(--ui-accent);
    }
}

.popup-footer {
    padding: var(--ui-space-3) var(--ui-space-4);
    border-top: 1px solid var(--ui-hairline);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--ui-space-3);
}

// 底色 / 描边 / 文字全部来自语义 token，明暗主题自动适配，不再需要深色特例
</style>
