import { describe, it, expect } from 'vitest';
import { getBrandLogo, GIRL_LOGO } from '@/utils/browser.util';

describe('browser.util', () => {
    it('getBrandLogo 始终返回 logo_girl（不再按浏览器分流）', () => {
        expect(getBrandLogo()).toBe(GIRL_LOGO);
        expect(getBrandLogo()).toBe('/image/logo/logo_girl-256.png');
    });
});
