import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import svgLoader from 'vite-svg-loader';
import path from 'path';

export default defineConfig({
    plugins: [vue(), svgLoader()],
    publicDir: 'public',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    server: {
        port: 5173,
        strictPort: false,
        proxy: {
            // 开发环境代理百度 sugrec 搜索建议接口，规避浏览器 CORS 限制
            '/sugrec': {
                target: 'https://www.baidu.com',
                changeOrigin: true
            }
        }
    },
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
                popup: path.resolve(__dirname, 'view/popup.html'),
                'background-firefox': path.resolve(__dirname, 'src/background.ts')
            },
            output: {
                entryFileNames: (chunkInfo) => {
                    if (chunkInfo.name === 'background-firefox') {
                        return 'js/background-firefox.js';
                    }
                    return 'js/[name]-[hash].js';
                },
                chunkFileNames: 'js/[name]-[hash].js',
                assetFileNames: 'js/[name]-[hash][extname]'
            }
        }
    }
});
