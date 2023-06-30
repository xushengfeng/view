import { defineConfig } from "electron-vite";
import * as path from "path";

export default defineConfig({
    main: {
        build: {
            rollupOptions: {
                external: ["@electron-toolkit/utils"],
            },
        },
    },
    renderer: {
        build: {
            rollupOptions: {
                input: {
                    frame: path.resolve(__dirname, "src/renderer/frame.html"),
                    setting: path.resolve(__dirname, "src/renderer/setting.html"),
                    browser_bg: path.resolve(__dirname, "src/renderer/browser_bg.html"),
                },
            },
        },
    },
});
