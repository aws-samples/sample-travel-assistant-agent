import react from '@vitejs/plugin-react';
import * as path from 'path';
import * as fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import { ViteEjsPlugin } from 'vite-plugin-ejs';

const defaultConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'default-config.json'), 'utf-8'));

const OVERRIDEN_CONFIG_PATH = path.join(__dirname, '../web-config.json');
const isConfigOverriden = fs.existsSync(OVERRIDEN_CONFIG_PATH);

const config = isConfigOverriden
  ? { ...defaultConfig, ...JSON.parse(fs.readFileSync(OVERRIDEN_CONFIG_PATH, 'utf-8')) }
  : defaultConfig;

const DEFAULT_LOGO_PATH = path.join(__dirname, 'src/assets/aws-logo.png');

const OVERRIDEN_NAV_LOGO_PATH = path.join(__dirname, '../nav-logo.png');
const isNavLogoOverriden = fs.existsSync(OVERRIDEN_NAV_LOGO_PATH);

const OVERRIDEN_CHAT_BUBBLE_PATH = path.join(__dirname, '../chat-bubble-avatar-logo.png');
const isChatBubbleLogoOverriden = fs.existsSync(OVERRIDEN_NAV_LOGO_PATH);

const uiConfigOverrideAliases = {
  'nav-logo.png': isNavLogoOverriden ? OVERRIDEN_NAV_LOGO_PATH : DEFAULT_LOGO_PATH,
  'chat-bubble-avatar-logo.png': isChatBubbleLogoOverriden ? OVERRIDEN_CHAT_BUBBLE_PATH : DEFAULT_LOGO_PATH,
};

const developmentConfig = {
  define: {
    global: {},
  },
  resolve: {
    alias: {
      './runtimeConfig': './runtimeConfig.browser',
      ...uiConfigOverrideAliases,
    },
  },
};

const nonDevelopmentConfig = {
  resolve: {
    alias: uiConfigOverrideAliases,
  },
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    ...(process.env.NODE_ENV === 'development' ? developmentConfig : nonDevelopmentConfig),
    plugins: [
      react(),
      ViteEjsPlugin({
        NAV_BG: config.navBg,
        CHAT_BUBBLE_AVATAR_BG: config.chatBubbleAvatarBg,
        CHAT_BUBBLE_AVATAR_LOGO_WIDTH: config.chatBubbleAvatarLogoWidth,
      }),
    ],
    server: {
      proxy: {
        '/api/': {
          target: env.API_ENDPOINT,
          prependPath: false,
          changeOrigin: true,
          rewrite: (path) => {
            const extracted = /^\/api\/(.+)$/.exec(path);

            if (!extracted) throw new Error('Invalid URL');

            return `${env.API_ENDPOINT}/${extracted[1]}`;
          },
        },
      },
    },
  };
});
