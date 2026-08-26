import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        name: '个人工作台',
        short_name: '工作台',
        description: '任务、日程、笔记、数据一体化个人工作台',
        theme_color: '#3b6fe0',
        background_color: '#f5f6f8',
        display: 'standalone',
        start_url: './',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/element-plus/') || id.includes('\\element-plus\\')) return 'vendor-element'
          if (id.includes('/vditor/') || id.includes('\\vditor\\')) return 'vendor-editor'
          if (/node_modules[\\/](vue|vue-router|pinia)[\\/]/.test(id)) return 'vendor-vue'
          if (/node_modules[\\/](dayjs|nanoid|jszip)[\\/]/.test(id)) return 'vendor-utils'
          return undefined
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
})
