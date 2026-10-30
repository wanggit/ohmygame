import { defineConfig } from "vite";
import playgamaBridge from "@playgama/bridge/vite";

// base "./" 让构建产物可部署在任意子路径（门户 zip / 合集站 /games/<id>/）。
// playgamaBridge() 注入 Bridge runtime（npm 打包必需，见 Bridge README）。
export default defineConfig({
  base: "./",
  plugins: [playgamaBridge()],
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5182,
  },
});
