import { initBackground } from '@/core/background';

// SW 薄壳,委托给 core/background(见设计文档 §3)
export default defineBackground(() => {
  initBackground();
});
