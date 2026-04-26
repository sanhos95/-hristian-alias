import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const site = (env.VITE_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  const ogImage = site ? `${site}/preview.jpg` : 'preview.jpg'

  return {
    plugins: [
      vue(),
      tailwindcss(),
      {
        name: 'inject-og-image',
        transformIndexHtml(html) {
          return html.replace(/%OG_IMAGE%/g, ogImage)
        },
      },
    ],
    base: './',
  }
})
