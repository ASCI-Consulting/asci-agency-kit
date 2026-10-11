import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',testMatch:'browser.spec.mjs',workers:1,use:{browserName:'chromium',headless:true,screenshot:'only-on-failure'}});
