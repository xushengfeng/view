import { defineConfig } from "electron-vite";
import * as path from "node:path";

export default defineConfig({
    main: {
        build: {
            rollupOptions: {
                external: ["@electron-toolkit/utils"],
            },
        },
    },
    preload: {
        build: {
            rollupOptions: {
                input: {
                    view: path.resolve(__dirname, "src/preload/view.ts"),
                },
            },
        },
    },
    renderer: {
        build: {
            rollupOptions: {
                input: {
                    frame: path.resolve(__dirname, "src/renderer/frame.html"),
                    setting: path.resolve(__dirname, "src/renderer/setting.html"),
                    download: path.resolve(__dirname, "src/renderer/download.html"),
                    view: path.resolve(__dirname, "src/renderer/view.html"),
                    file: path.resolve(__dirname, "src/renderer/file.html"),
                    browser_bg: path.resolve(__dirname, "src/renderer/browser_bg.html"),
                },
            },
        },
    },
});
