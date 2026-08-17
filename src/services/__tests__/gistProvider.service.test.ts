/**
 * gistProvider.service 测试
 * 覆盖 GitHub / Gitee 双平台适配器：请求 URL、认证方式（Header Bearer vs Query access_token）、
 * 请求方法、错误分类（网络/超时/401/频率限制）、Gitee emoji 无损转义与 1MB 文件大小限制。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    createGistProvider,
    escapeForGitee,
    SyncProviderError
} from '@/services/gistProvider.service';

const TEST_TOKEN = 'test_token_123';

function createResponse(body: unknown, status = 200): Response {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
        status,
        ok: status >= 200 && status < 300,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(text)
    } as Response;
}

/** 获取 mock fetch 最近一次调用的 url 与 init */
function lastFetchCall(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit] {
    const calls = fetchMock.mock.calls;
    return calls[calls.length - 1] as [string, RequestInit];
}

describe('createGistProvider 工厂', () => {
    it("createGistProvider('github') 返回 GitHub 适配器", () => {
        const provider = createGistProvider('github');
        expect(provider.id).toBe('github');
        expect(provider.name).toBe('GitHub');
        expect(provider.tokenHint).toContain('github.com');
    });

    it("createGistProvider('gitee') 返回 Gitee 适配器", () => {
        const provider = createGistProvider('gitee');
        expect(provider.id).toBe('gitee');
        expect(provider.name).toBe('Gitee');
        expect(provider.tokenHint).toContain('gitee.com');
    });
});

describe('GitHub provider', () => {
    const provider = createGistProvider('github');

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('validateToken 使用 Bearer 头与 API 版本头访问 api.github.com/user', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createResponse({ login: 'tester', id: 1, avatar_url: 'https://avatar.png' })
        );
        vi.stubGlobal('fetch', fetchMock);

        const user = await provider.validateToken(TEST_TOKEN);

        expect(user).toEqual({ login: 'tester', id: 1, avatar: 'https://avatar.png' });
        const [url, init] = lastFetchCall(fetchMock);
        expect(url).toBe('https://api.github.com/user');
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
        expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    });

    it('listGists 访问 /gists?per_page=100 并返回列表', async () => {
        const gists = [{ id: 'g1', files: {} }];
        const fetchMock = vi.fn().mockResolvedValue(createResponse(gists));
        vi.stubGlobal('fetch', fetchMock);

        const result = await provider.listGists(TEST_TOKEN);

        expect(result).toEqual(gists);
        expect(lastFetchCall(fetchMock)[0]).toBe('https://api.github.com/gists?per_page=100');
    });

    it('getGistFileContent 返回指定文件内容', async () => {
        const fetchMock = vi.fn().mockResolvedValue(createResponse({
            id: 'g1',
            files: { 'sync.json': { content: '{"version":"1.0"}' } }
        }));
        vi.stubGlobal('fetch', fetchMock);

        const content = await provider.getGistFileContent(TEST_TOKEN, 'g1', 'sync.json');

        expect(content).toBe('{"version":"1.0"}');
        expect(lastFetchCall(fetchMock)[0]).toBe('https://api.github.com/gists/g1');
    });

    it('getGistFileContent 在 Gist 404 时返回 null', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createResponse({ message: 'Not Found' }, 404)));

        const content = await provider.getGistFileContent(TEST_TOKEN, 'missing', 'sync.json');

        expect(content).toBeNull();
    });

    it('getGistFileContent 在文件缺失时返回 null', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createResponse({ id: 'g1', files: {} })));

        const content = await provider.getGistFileContent(TEST_TOKEN, 'g1', 'sync.json');

        expect(content).toBeNull();
    });

    it('getGistFileContent 在 content 缺失时回退 raw_url 拉取', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createResponse({
                id: 'g1',
                files: { 'sync.json': { raw_url: 'https://gist.githubusercontent.com/raw/abc', truncated: true } }
            }))
            .mockResolvedValueOnce(createResponse('{"via":"raw"}'));
        vi.stubGlobal('fetch', fetchMock);

        const content = await provider.getGistFileContent(TEST_TOKEN, 'g1', 'sync.json');

        expect(content).toBe('{"via":"raw"}');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(lastFetchCall(fetchMock)[0]).toBe('https://gist.githubusercontent.com/raw/abc');
    });

    it('createGist 以 POST 创建并返回 Gist id', async () => {
        const fetchMock = vi.fn().mockResolvedValue(createResponse({ id: 'new_gist' }));
        vi.stubGlobal('fetch', fetchMock);

        const id = await provider.createGist(TEST_TOKEN, 'sync.json', '{"a":1}', '测试描述');

        expect(id).toBe('new_gist');
        const [url, init] = lastFetchCall(fetchMock);
        expect(url).toBe('https://api.github.com/gists');
        expect(init.method).toBe('POST');
        const body = JSON.parse(init.body as string);
        expect(body.description).toBe('测试描述');
        expect(body.public).toBe(false);
        expect(body.files['sync.json'].content).toBe('{"a":1}');
    });

    it('updateGist 以 PATCH 更新文件内容', async () => {
        const fetchMock = vi.fn().mockResolvedValue(createResponse({ id: 'g1' }));
        vi.stubGlobal('fetch', fetchMock);

        await provider.updateGist(TEST_TOKEN, 'g1', 'sync.json', '{"b":2}');

        const [url, init] = lastFetchCall(fetchMock);
        expect(url).toBe('https://api.github.com/gists/g1');
        expect(init.method).toBe('PATCH');
        const body = JSON.parse(init.body as string);
        expect(body.files['sync.json'].content).toBe('{"b":2}');
    });
});

describe('Gitee provider', () => {
    const provider = createGistProvider('gitee');

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('validateToken 通过 query access_token 访问 gitee.com/api/v5/user，不带 Authorization 头', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createResponse({ login: 'gitee_user', id: 2, avatar_url: 'https://avatar2.png' })
        );
        vi.stubGlobal('fetch', fetchMock);

        const user = await provider.validateToken(TEST_TOKEN);

        expect(user.login).toBe('gitee_user');
        const [url, init] = lastFetchCall(fetchMock);
        expect(url).toBe(`https://gitee.com/api/v5/user?access_token=${TEST_TOKEN}`);
        expect((init.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
    });

    it('listGists URL 带 access_token', async () => {
        const fetchMock = vi.fn().mockResolvedValue(createResponse([]));
        vi.stubGlobal('fetch', fetchMock);

        await provider.listGists(TEST_TOKEN);

        expect(lastFetchCall(fetchMock)[0]).toBe(`https://gitee.com/api/v5/gists?per_page=100&access_token=${TEST_TOKEN}`);
    });

    it('getGistFileContent URL 带 access_token，404 返回 null', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(createResponse({ id: 'g1', files: { 'sync.json': { content: '{}' } } }));
        vi.stubGlobal('fetch', fetchMock);

        const content = await provider.getGistFileContent(TEST_TOKEN, 'g1', 'sync.json');
        expect(content).toBe('{}');
        expect(lastFetchCall(fetchMock)[0]).toBe(`https://gitee.com/api/v5/gists/g1?access_token=${TEST_TOKEN}`);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createResponse({ message: 'Not Found' }, 404)));
        const missing = await provider.getGistFileContent(TEST_TOKEN, 'missing', 'sync.json');
        expect(missing).toBeNull();
    });

    it('createGist 以 POST 提交 JSON body，files 结构正确', async () => {
        const fetchMock = vi.fn().mockResolvedValue(createResponse({ id: 'gitee_gist' }));
        vi.stubGlobal('fetch', fetchMock);

        const id = await provider.createGist(TEST_TOKEN, 'sync.json', '{"a":1}', '测试描述');

        expect(id).toBe('gitee_gist');
        const [url, init] = lastFetchCall(fetchMock);
        expect(url).toBe(`https://gitee.com/api/v5/gists?access_token=${TEST_TOKEN}`);
        expect(init.method).toBe('POST');
        const body = JSON.parse(init.body as string);
        expect(body.description).toBe('测试描述');
        expect(body.files['sync.json'].content).toBe('{"a":1}');
    });

    it('updateGist 以 PATCH 提交，files 项带 content 与 filename', async () => {
        const fetchMock = vi.fn().mockResolvedValue(createResponse({ id: 'g1' }));
        vi.stubGlobal('fetch', fetchMock);

        await provider.updateGist(TEST_TOKEN, 'g1', 'sync.json', '{"b":2}');

        const [url, init] = lastFetchCall(fetchMock);
        expect(url).toBe(`https://gitee.com/api/v5/gists/g1?access_token=${TEST_TOKEN}`);
        expect(init.method).toBe('PATCH');
        const body = JSON.parse(init.body as string);
        expect(body.files['sync.json'].content).toBe('{"b":2}');
        expect(body.files['sync.json'].filename).toBe('sync.json');
    });
});

describe('escapeForGitee', () => {
    it('纯 ASCII 内容不变', () => {
        const content = '{"name":"test","url":"https://example.com"}';
        expect(escapeForGitee(content)).toBe(content);
    });

    it('含 emoji 的 JSON 转义后不含 4 字节字符，且 JSON.parse 无损还原', () => {
        const original = {
            categories: [{ id: 'c1', name: '工具 🚀' }],
            apps: [{ id: 'a1', name: '站点', icon: '😀🔗' }]
        };
        const content = JSON.stringify(original);

        const escaped = escapeForGitee(content);

        // 转义后不再有 4 字节 UTF-8 字符（已转换为 JSON 代理对转义序列）
        expect(/[\u{10000}-\u{10FFFF}]/u.test(escaped)).toBe(false);
        // 仍是合法 JSON 且解析后与原对象完全一致
        expect(JSON.parse(escaped)).toEqual(original);
    });
});

describe('Gitee 单文件 1MB 限制', () => {
    const provider = createGistProvider('gitee');

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('createGist 内容超过 1MB 时抛出含「1MB」的错误且不发请求', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const bigContent = 'a'.repeat(1024 * 1024 + 1);

        await expect(provider.createGist(TEST_TOKEN, 'sync.json', bigContent, 'desc'))
            .rejects.toThrow('1MB');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('updateGist 内容超过 1MB 时抛出含「1MB」的错误且不发请求', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const bigContent = 'a'.repeat(1024 * 1024 + 1);

        await expect(provider.updateGist(TEST_TOKEN, 'g1', 'sync.json', bigContent))
            .rejects.toThrow('1MB');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('错误分类', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetch 抛 TypeError 时转换为「无法连接 <平台>」', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

        await expect(createGistProvider('github').validateToken(TEST_TOKEN))
            .rejects.toThrow('无法连接 GitHub，请检查网络或代理（国内可能需代理访问）');

        await expect(createGistProvider('gitee').validateToken(TEST_TOKEN))
            .rejects.toThrow('无法连接 Gitee，请检查网络连接');
    });

    it('fetch 抛 AbortError 时提示「请求超时」', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError')));

        await expect(createGistProvider('github').validateToken(TEST_TOKEN))
            .rejects.toThrow('无法连接 GitHub（请求超时）');
    });

    it('HTTP 401 抛出 SyncProviderError 且 status 为 401', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createResponse({ message: 'Bad credentials' }, 401)));

        const error = await createGistProvider('github').validateToken(TEST_TOKEN).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(SyncProviderError);
        expect((error as SyncProviderError).status).toBe(401);
        expect((error as SyncProviderError).message).toBe('Token 已失效，请重新连接 GitHub');
    });

    it('HTTP 403 且消息含 rate limit 时提示「频率限制」', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createResponse({ message: 'API rate limit exceeded' }, 403)));

        const error = await createGistProvider('gitee').listGists(TEST_TOKEN).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(SyncProviderError);
        expect((error as SyncProviderError).status).toBe(403);
        expect((error as SyncProviderError).message).toBe('Gitee API 频率限制，请稍后再试');
    });

    it('其他 HTTP 错误抛出带状态码的 SyncProviderError', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createResponse({ message: 'Server Error' }, 500)));

        const error = await createGistProvider('github').listGists(TEST_TOKEN).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(SyncProviderError);
        expect((error as SyncProviderError).status).toBe(500);
        expect((error as SyncProviderError).message).toBe('Server Error (500)');
    });
});
