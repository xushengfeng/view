/// <reference types="vite/client" />
// Modules to control application life and create native browser window
import {
    app,
    globalShortcut,
    BrowserWindow,
    ipcMain,
    dialog,
    nativeTheme,
    BrowserView,
    screen,
    Menu,
    session,
} from "electron";
import Store from "../../lib/store/store";
import * as path from "node:path";
const run_path = path.join(path.resolve(__dirname, ""), "../../");
import { spawn, exec } from "node:child_process";
import * as fs from "node:fs";
import { t, lan, getLans, matchFitLan } from "../../lib/translate/translate";
import url from "node:url";
import type { setting, DownloadItem } from "../types";

const store = new Store();

ipcMain.on("store", (e, x) => {
    if (x.type === "get") {
        e.returnValue = store.get(x.path);
    } else if (x.type === "set") {
        store.set(x.path, x.value);
    } else if (x.type === "path") {
        e.returnValue = app.getPath("userData");
    }
});

// 自定义用户路径
try {
    let userDataPath = fs.readFileSync(path.join(run_path, "preload_config")).toString().trim();
    if (userDataPath) {
        if (app.isPackaged) {
            userDataPath = path.join(run_path, "../../", userDataPath);
        } else {
            userDataPath = path.join(run_path, userDataPath);
        }
        app.setPath("userData", userDataPath);
    }
} catch (e) {}

// 获取运行位置
ipcMain.on("run_path", (event) => {
    event.returnValue = run_path;
});

let /** 是否开启开发模式 */ dev: boolean;
// 自动开启开发者模式
if (process.argv.includes("-d") || import.meta.env.DEV) {
    dev = true;
} else {
    dev = false;
}

function renderer_url(
    file_name: string,
    q: Electron.LoadFileOptions = {
        query: { config_path: app.getPath("userData") },
    },
) {
    if (!q.query) {
        q.query = { config_path: app.getPath("userData") };
    } else {
        q.query.config_path = app.getPath("userData");
    }
    let x: url.URL;
    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
        const main_url = `${process.env.ELECTRON_RENDERER_URL}/${file_name}`;
        x = new url.URL(main_url);
    } else {
        x = new url.URL(`file://${path.join(__dirname, "../renderer", file_name)}`);
    }
    if (q) {
        if (q.search) x.search = q.search;
        if (q.query) {
            for (const i in q.query) {
                x.searchParams.set(i, q.query[i]);
            }
        }
        if (q.hash) x.hash = q.hash;
    }
    return x.toString();
}

/** 加载网页 */
function renderer_path(window: BrowserWindow | Electron.WebContents, file_name: string, q?: Electron.LoadFileOptions) {
    window.loadURL(renderer_url(file_name, q));
}

// @ts-ignore
lan(store.get("lan"));

app.commandLine.appendSwitch("enable-experimental-web-platform-features", "enable");

app.whenReady().then(() => {
    if (store.get("firstRun") === undefined) setDefaultSetting();
    fixSettingTree();

    nativeTheme.themeSource = store.get("appearance.theme");

    const template = [
        // { role: 'appMenu' }
        ...(isMac
            ? [
                  {
                      label: app.name,
                      submenu: [
                          { label: `${t("关于")} ${app.name}`, role: "about" },
                          { type: "separator" },
                          {
                              label: t("设置"),
                              click: () => {},
                              accelerator: "CmdOrCtrl+,",
                          },
                          { type: "separator" },
                          { label: t("服务"), role: "services" },
                          { type: "separator" },
                          { label: `${t("隐藏")} ${app.name}`, role: "hide" },
                          { label: t("隐藏其他"), role: "hideOthers" },
                          { label: t("全部显示"), role: "unhide" },
                          { type: "separator" },
                          { label: `退出 ${app.name}`, role: "quit" },
                      ],
                  },
              ]
            : []),
        // { role: 'fileMenu' }
        {
            label: t("文件"),
            submenu: [
                ...(isMac
                    ? []
                    : [
                          {
                              label: t("设置"),
                              click: () => {},
                              accelerator: "CmdOrCtrl+,",
                          },
                          { type: "separator" },
                      ]),
                { type: "separator" },
                { label: t("关闭"), role: "close" },
            ],
        },
        { role: "editMenu" },
        {
            label: t("视图"),
            submenu: [
                { label: t("重新加载"), role: "reload" },
                { label: t("强制重载"), role: "forceReload" },
                { label: t("开发者工具"), role: "toggleDevTools" },
                { label: t("实际大小"), role: "resetZoom", accelerator: "CmdOrCtrl+0" },
                { label: t("放大"), role: "zoomIn", accelerator: "CmdOrCtrl+=" },
                { label: t("缩小"), role: "zoomOut" },
                { type: "separator" },
                { label: t("全屏"), role: "togglefullscreen" },
            ],
        },
        // { role: 'windowMenu' }
        {
            label: t("窗口"),
            submenu: [
                {
                    label: t("框架"),
                    accelerator: "CmdOrCtrl+S",
                    click(_i, w) {
                        for (const i of winL) {
                            if (i[1] === w) {
                                winToChrome.get(i[0]).view.webContents.send("win", "chrome_toggle");
                                break;
                            }
                        }
                    },
                },
                { label: t("最小化"), role: "minimize" },
                { label: t("关闭"), role: "close" },
                ...(isMac
                    ? [
                          { type: "separator" },
                          { label: t("置于最前面"), role: "front" },
                          { type: "separator" },
                          { label: t("窗口"), role: "window" },
                      ]
                    : []),
            ],
        },
        {
            label: t("帮助"),
            role: "help",
            submenu: [
                {
                    label: t("教程帮助"),
                    click: () => {},
                },
                { type: "separator" },
                {
                    label: t("关于"),
                    click: () => {},
                },
            ],
        },
    ] as (Electron.MenuItemConstructorOptions | Electron.MenuItem)[];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    createWin();

    check_window();
});

app.on("will-quit", () => {
    // Unregister all shortcuts.
    globalShortcut.unregisterAll();
});

let the_icon = null;
if (process.platform === "win32") {
    the_icon = path.join(run_path, "assets/logo/icon.ico");
} else {
    the_icon = path.join(run_path, "assets/logo/1024x1024.png");
}
ipcMain.on("setting", async (event, arg, arg1, arg2) => {
    switch (arg) {
        case "save_err": {
            console.log("保存设置失败");
            break;
        }
        case "reload":
            app.relaunch();
            app.exit(0);
            break;
        case "clear": {
            const ses = session.defaultSession;
            if (arg1 === "storage") {
                ses.clearStorageData()
                    .then(() => {
                        event.sender.send("setting", "storage", true);
                    })
                    .catch(() => {
                        event.sender.send("setting", "storage", false);
                    });
            } else {
                Promise.all([
                    ses.clearAuthCache(),
                    ses.clearCache(),
                    ses.clearCodeCaches({}),
                    ses.clearHostResolverCache(),
                ])
                    .then(() => {
                        event.sender.send("setting", "cache", true);
                    })
                    .catch(() => {
                        event.sender.send("setting", "cache", false);
                    });
            }
            break;
        }
        case "open_dialog":
            dialog.showOpenDialog(arg1).then((x) => {
                event.sender.send("setting", arg, arg2, x);
            });
            break;
        case "move_user_data": {
            if (!arg1) return;
            const to_path = path.resolve(arg1);
            const pre_path = app.getPath("userData");
            fs.mkdirSync(to_path, { recursive: true });
            if (process.platform === "win32") {
                exec(`xcopy ${pre_path}\\** ${to_path} /Y /s`);
            } else {
                exec(`cp -r ${pre_path}/** ${to_path}`);
            }
        }
    }
});

const isMac = process.platform === "darwin";

function get_size(w: number, h: number) {
    return { x: 0, y: 0, width: w, height: h };
}

/** BrowserWindow id */
type bwin_id = number & { readonly __tag: unique symbol };
// 一个browserview对应一个id，不存在history
/** 网页id（包括在同一页面跳转的） */
type view_id = number & { readonly __tag: unique symbol };
const winL: Map<bwin_id, BrowserWindow> = new Map();
// 不同的view分配到窗口
const winToViewl: Map<bwin_id, view_id[]> = new Map();
const winToChrome: Map<bwin_id, { view: BrowserView; size: "normal" | "hide" | "full" }> = new Map();
const viewL: Map<view_id, BrowserView> = new Map();
const winToPasswd: Map<BrowserWindow, BrowserView> = new Map();

// 窗口
async function createWin() {
    const window_name = new Date().getTime() as bwin_id;
    const main_window = new BrowserWindow({
        backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f0f0f" : "#ffffff",
        icon: the_icon,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
        },
        frame: false,
        show: true,
    }) as BrowserWindow & { html: string };
    winL.set(window_name, main_window);

    winToViewl.set(window_name, []);

    main_window.on("close", () => {
        store.set("appearance.size", {
            w: main_window.getNormalBounds().width,
            h: main_window.getNormalBounds().height,
            m: main_window.isMaximized(),
        });
        for (const i of main_window.getBrowserViews()) {
            // @ts-ignore
            i?.webContents?.destroy();
        }
    });

    main_window.on("closed", () => {
        winL.delete(window_name);
    });

    // 浏览器大小适应
    main_window.on("resize", () => {
        setTimeout(() => {
            const [w, h] = main_window.getContentSize();
            for (const i of main_window.getBrowserViews()) {
                if (i.getBounds().width !== 0 && i !== chrome) i.setBounds(get_size(w, h));
                if (i === chrome) set_chrome_size(window_name);
            }
        }, 0);
    });

    main_window.on("maximize", () => {
        chrome.webContents.send("win", "max");
    });
    main_window.on("unmaximize", () => {
        chrome.webContents.send("win", "unmax");
    });

    const chrome = new BrowserView({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
        },
    });
    renderer_path(chrome.webContents, "frame.html");
    if (dev) chrome.webContents.openDevTools();
    main_window.addBrowserView(chrome);
    winToChrome.set(window_name, { view: chrome, size: "normal" });
    set_chrome_size(window_name);
    chrome.webContents.on("did-finish-load", () => {
        chrome.webContents.send("win", "id", window_name);
        chrome.webContents.send("win", "userData", app.getPath("userData"));
    });

    return window_name;
}

function set_chrome_size(pid: bwin_id) {
    const main_window = winL.get(pid);
    const x = winToChrome.get(pid);
    const o = { full: main_window.getContentSize()[1], normal: 24, hide: 0 };
    x.view.setBounds({
        x: 0,
        y: 0,
        width: main_window.getContentSize()[0],
        height: o[x.size],
    });
}

ipcMain.on("win", (e, pid, type) => {
    console.log(pid, type);
    if (!pid) return;
    const main_window = BrowserWindow.fromWebContents(e.sender);
    switch (type) {
        case "mini":
            main_window.minimize();
            break;
        case "max":
            if (main_window.isMaximized()) {
                main_window.unmaximize();
            } else {
                main_window.maximize();
            }
            break;
        case "close":
            main_window.close();
            winL.delete(pid);
            for (const i of winToViewl.get(pid)) {
                viewL.delete(i);
            }
            winToViewl.delete(pid);
            winToChrome.delete(pid);
            break;
        case "full_chrome":
            winToChrome.get(pid).size = "full";
            set_chrome_size(pid);
            break;
        case "normal_chrome":
            winToChrome.get(pid).size = "normal";
            set_chrome_size(pid);
            break;
        case "hide_chrome":
            winToChrome.get(pid).size = "hide";
            set_chrome_size(pid);
            break;
    }
});

type tree = {
    [id in view_id | "0"]: {
        url: string;
        title: string;
        logo: string;
        next?: view_id[];
    };
};

// @ts-ignore
const tree_text_store = new Store({ name: "text" });
// @ts-ignore
const tree_store = new Store({ name: "tree" });

if (!fs.existsSync(path.join(app.getPath("userData"), "capture"))) {
    fs.mkdirSync(path.join(app.getPath("userData"), "capture"));
}

function get_real_url(url: string) {
    if (url.startsWith("view://")) {
        let h = url.replace(/^view:\/\//, "");
        h = h.replace(/(^\w+)/, "$1.html");
        return renderer_url(h);
    }
    if (url.startsWith("file://")) {
        return renderer_url(url.replace("file://", "file.html?path="));
    }
    return url;
    // TODO 改变location和new URL
}

/** 创建浏览器页面 */
async function createView(_window_name: bwin_id, url: string, pid: view_id, id?: view_id) {
    let window_name = _window_name;
    const main_window = winL.get(window_name);
    const chrome = winToChrome.get(window_name).view;

    if (main_window.isDestroyed()) {
        window_name = await createWin();
    }
    const view_id = id ?? (new Date().getTime() as view_id);

    tree_store.set(String(view_id), { logo: "", url: url, title: "" });

    const op: Electron.BrowserViewConstructorOptions = {
        webPreferences: {
            nodeIntegrationInSubFrames: true,
            preload: path.join(__dirname, "../preload", "view.js"),
        },
    };
    if (url.startsWith("view://") || url.startsWith("file://")) {
        op.webPreferences.nodeIntegration = true;
        op.webPreferences.contextIsolation = false;
        op.webPreferences.webSecurity = false;
        op.webPreferences.preload = null;
    }

    const search_view = new BrowserView(op);
    search_view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#0f0f0f" : "#ffffff");
    viewL.set(view_id, search_view);
    main_window.addBrowserView(search_view);
    main_window.setTopBrowserView(chrome);
    winToViewl.get(window_name).push(view_id);
    const wc = search_view.webContents;
    const real_url = get_real_url(url);
    wc.loadURL(real_url);
    const [w, h] = main_window.getContentSize();
    search_view.setBounds(get_size(w, h));
    main_window.setContentSize(w, h + 1);
    main_window.setContentSize(w, h);
    wc.setWindowOpenHandler(({ url }) => {
        createView(window_name, url, view_id);
        return { action: "deny" };
    });
    if (dev) wc.openDevTools();
    if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "new", url);
    sendViews(window_name, "update", view_id, null, null, { url: url });
    wc.on("destroyed", () => {
        main_window.removeBrowserView(search_view);
        viewL.delete(view_id);
    });
    wc.on("page-title-updated", (_event, title) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "title", title);
        tree_store.set(`${view_id}.title`, title);

        sendViews(window_name, "update", view_id, null, null, { title });
    });
    wc.on("page-favicon-updated", (_event, favlogo) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "icon", favlogo);
        tree_store.set(`${view_id}.logo`, favlogo[0]);
        sendViews(window_name, "update", view_id, null, null, { icon: favlogo });
    });
    wc.on("will-navigate", (event) => {
        createView(window_name, event.url, view_id);
        event.preventDefault();
    });
    wc.on("did-navigate", (_event, url) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "url", url);
        sendViews(window_name, "update", view_id, null, null, { url: url });
    });
    wc.on("did-navigate-in-page", (_event, url, isMainFrame) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "url", url);
        if (isMainFrame) tree_store.set(`${view_id}.url`, url);
        sendViews(window_name, "update", view_id, null, null, { url: url });
    });
    wc.on("did-start-loading", () => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "load", true);
    });
    wc.on("did-stop-loading", () => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "load", false);
    });
    wc.on("did-fail-load", (_event, err_code, err_des) => {
        renderer_path(wc, "browser_bg.html", {
            query: { type: "did-fail-load", err_code: String(err_code), err_des },
        });
        if (dev) wc.openDevTools();
    });
    async function save_pic() {
        let image = await wc.capturePage();
        fs.writeFile(
            path.join(app.getPath("userData"), "capture", `${view_id}.jpg`),
            // @ts-ignore
            image
                .resize({
                    height: Math.floor(image.getSize().height / 2),
                    width: Math.floor(image.getSize().width / 2),
                    quality: "good",
                })
                .toJPEG(7),
            (err) => {
                if (err) return;
                image = null;
            },
        );
    }
    wc.on("blur", () => save_pic);
    wc.on("did-finish-load", async () => {
        save_pic();

        tree_text_store.set(String(view_id), await wc.executeJavaScript("document.body.innerText"));

        if (url.startsWith("view://download")) {
            if (aria2_port) {
                wc.send("download", "port", aria2_port);
            } else {
                wc.send("download", "port", await aria2_start());
            }
        }
    });
    wc.on("render-process-gone", () => {
        renderer_path(wc, "browser_bg.html", {
            query: { type: "render-process-gone" },
        });
        if (dev) wc.openDevTools();
    });
    wc.on("unresponsive", () => {
        renderer_path(wc, "browser_bg.html", { query: { type: "unresponsive" } });
        if (dev) wc.openDevTools();
    });
    wc.on("responsive", () => {
        wc.loadURL(url);
    });
    wc.on("certificate-error", () => {
        renderer_path(wc, "browser_bg.html", {
            query: { type: "certificate-error" },
        });
        if (dev) wc.openDevTools();
    });

    wc.on("context-menu", (_e, p) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("win", "menu", p);
    });

    wc.session.on("will-download", (e, i) => {
        e.preventDefault();
        download(i.getURL());
    });

    wc.session.setPermissionCheckHandler((_w, _p, _ro) => {
        return true;
    });
    wc.session.setPermissionRequestHandler((w, p, cb) => {
        chrome.webContents.send("site_about", p, w.getURL());
        ipcMain.on("site_about", (_e, a, pp, b) => {
            if (a === w.getURL() && pp === p) {
                cb(b);
            }
        });
    });

    wc.on("update-target-url", (_e, url) => {
        wc.send("view_event", "target_url", url);
    });

    wc.on("devtools-open-url", (_e, url) => {
        createView(window_name, url, view_id);
    });

    wc.on("zoom-changed", (_e, d) => {
        const l = wc.zoomFactor;
        let x = l + (d === "in" ? 0.1 : -0.1);
        x = Math.min(5, Math.max(0.2, x));
        wc.setZoomFactor(x);
        chrome.webContents.send("win", "zoom", x);
    });

    if (id) return id;

    // @ts-ignore
    const l = (tree_store.get(`${pid}.next`) as tree[0]["next"]) || [];
    l.push(view_id);
    tree_store.set(`${pid}.next`, l);
    sendViews(window_name, "add", view_id, pid, null, null);

    return view_id;
}

ipcMain.on("tab_view", (e, id, arg, arg2) => {
    console.log(arg);

    const main_window = BrowserWindow.fromWebContents(e.sender);
    const search_window = viewL.get(id);
    switch (arg) {
        case "close":
            search_window.webContents.close();
            for (const x of winL) {
                const wid = x[0];
                const w = x[1];
                if (w === main_window) {
                    sendViews(wid, "close", id, null, null, null);
                    break;
                }
            }
            break;
        case "stop":
            search_window.webContents.stop();
            break;
        case "reload":
            search_window.webContents.reload();
            break;
        case "add":
            for (const x of winL) {
                const wid = x[0];
                const w = x[1];
                if (w === main_window) {
                    createView(wid, arg2, 0 as view_id);
                    break;
                }
            }
            break;
        case "switch":
            // 获取BrowserWindow并提升bview
            winToViewl.forEach((bvs, id) => {
                for (const i of bvs) {
                    if (i === arg2) {
                        winL.get(id).setTopBrowserView(viewL.get(i));
                        winL.get(id).setTopBrowserView(winToChrome.get(id).view);
                        winL.get(id).moveTop();
                        winL.get(id).focus();
                        return;
                    }
                }
            });
            break;
        case "restart":
            for (const x of winL) {
                const wid = x[0];
                const w = x[1];
                if (w === main_window) {
                    // @ts-ignore
                    const url = (tree_store.get(String(arg2)) as tree[0]).url;
                    createView(wid, url, null, arg2 as view_id);
                    break;
                }
            }
            break;
        case "dev":
            search_window.webContents.openDevTools();
            break;
        case "inspect":
            search_window.webContents.inspectElement(arg2.x, arg2.y);
            break;
        case "download":
            download(arg2);
            break;
    }
});

function sendViews(
    sender: bwin_id,
    type: "add" | "close" | "update" | "move",
    id: number,
    pid: number,
    wid: number,
    op,
) {
    for (const w of winL) {
        if (w[0] !== sender) {
            const chrome = winToChrome.get(w[0]).view;
            chrome.webContents.send("view", type, id, pid, wid, op);
        }
    }
}

ipcMain.on("view", (e, type, arg) => {
    const main_window = BrowserWindow.fromWebContents(e.sender);
    switch (type) {
        case "opensearch":
            console.log(arg);
            for (const i in arg) {
                store.set(`searchEngine.engine.${i}`, arg[i]);
            }
            break;
        case "input":
            console.log(arg);

            if (arg.action === "focus") {
                const bv = new BrowserView();
                main_window.addBrowserView(bv);
                const r = arg.position as DOMRect;
                const w = 100;
                const h = 100;
                bv.setBounds({
                    width: w,
                    height: h,
                    x: Math.floor(Math.min(main_window.getBounds().width - w, r.x)),
                    y: Math.floor(Math.min(main_window.getBounds().height - h, r.y)),
                });
                renderer_path(bv.webContents, "passwd.html");
                winToPasswd.set(main_window, bv);
                bv.webContents.on("did-finish-load", () => {
                    bv.webContents.send("input", arg);
                });
                if (dev) bv.webContents.openDevTools();
            } else {
                const bv = winToPasswd.get(main_window);
                if (bv) {
                    main_window.removeBrowserView(bv);
                    bv.webContents.close();
                    winToPasswd.delete(main_window);
                }
            }
    }
});

ipcMain.on("theme", (_e, v) => {
    nativeTheme.themeSource = v;
    store.set("appearance.theme", v);
});

// @ts-ignore
const download_store = new Store({ name: "download" });

let aria2_port = Number.NaN;
const aria2_f = path.join(run_path, "extra", process.platform, process.arch, "engine", "aria2c");
const aria2_conf = path.join(run_path, "extra", process.platform, process.arch, "engine", "aria2.conf");

let aria2_p: ReturnType<typeof spawn>;
function aria2_start() {
    console.log(aria2_f, aria2_conf);
    const child = spawn(aria2_f, [`--conf-path=${aria2_conf}`, `-d ${app.getPath("downloads")}`]);
    aria2_p = child;
    return new Promise((re: (n: number) => void, rj) => {
        child.stdout.on("data", (data) => {
            console.log(`Received chunk ${data}`);
            if (String(data).includes("listening on TCP port")) {
                aria2_port = Number(String(data).match(/listening on TCP port ([0-9]+)/)[1]);
                re(aria2_port);
            }
        });
        child.stderr.on("data", (data) => {
            console.log(`Received chunk ${data}`);
            rj(data);
        });
    });
}

function aria2(m: string, p: any[]) {
    return new Promise((re: (v: any) => void, rj) => {
        fetch(`http://localhost:${aria2_port}/jsonrpc`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: `aria2.${m}`,
                id: "1",
                params: p,
            }),
        })
            .then((r) => r.json())
            .then((data) => {
                console.log(data);
                re(data);
            })
            .catch((e) => rj(e));
    });
}

let check_global_aria2_run = false;
function check_global_aria2() {
    setInterval(async () => {
        if (check_global_aria2_run) {
            let has = 0;
            let t = 0;
            const al = (await aria2("tellActive", [])) as any[];
            for (const i of al) {
                has += i.completedLength;
                t += i.totalLength;
            }
            const wl = (await aria2("tellActive", [])) as any[];
            for (const i of wl) {
                t += i.totalLength;
            }
            for (const i of winL.values()) {
                i.setProgressBar(has / t);
            }
        }
    }, 500);
}

async function download(url: string) {
    if (!aria2_port) await aria2_start();
    aria2("addUri", [[url]]).then((x) => {
        // @ts-ignore
        const l = (download_store.get("items") || []) as DownloadItem[];
        l.unshift({
            id: x.id,
            createdAt: new Date().getTime(),
            filename: "",
            status: "pending",
            url,
        });
        download_store.set("items", l);
    });
    check_global_aria2_run = true;
    check_global_aria2();
}

function check_window() {
    const w = store.get("windows") as setting["windows"];
    for (const i of w.desktop) {
        showDesktop(i);
    }
    for (const i of w.fixed) {
        showItem(i);
    }
}

function showDesktop(d: setting["windows"]["desktop"][0]) {
    const se = screen.getAllDisplays().find((x) => x.id === d.screenId) || screen.getPrimaryDisplay();
    const isWin32 = process.platform === "win32";
    const wi = new BrowserWindow({
        fullscreen: true,
        autoHideMenuBar: true,
        ...(isWin32 ? {} : { type: "desktop" }),
    });
    wi.setBounds(se.bounds);
    wi.loadURL(d.url);
    if (isWin32) {
        const { attach } = require("electron-as-wallpaper");
        attach(wi, {
            forwardKeyboardInput: true,
            forwardMouseInput: true,
        });
    }
}

function showItem(i: setting["windows"]["fixed"][0]) {
    function getSize(S: string, a: "x" | "y" | "w" | "h", root?: number | null) {
        const se = screen.getAllDisplays().find((x) => x.id === root);
        if (S.includes("px")) {
            if (a === "x") {
                return Number.parseInt(S.replace("px", "")) + (se?.bounds?.x | 0);
            }
            if (a === "y") {
                return Number.parseInt(S.replace("px", "")) + (se?.bounds?.y | 0);
            }
            return Number.parseInt(S.replace("px", ""));
        }
    }
    const wi = new BrowserWindow({
        width: getSize(i.width, "w", i.root),
        height: getSize(i.height, "h", i.root),
        x: getSize(i.left, "x", i.root),
        y: getSize(i.top, "x", i.root),
        frame: false,
        skipTaskbar: true,
    });
    wi.loadURL(i.url);
    if (i.onTop) {
        wi.setAlwaysOnTop(true);
    }
    wi.setResizable(false);
}

// 默认设置
const defaultSetting: setting = {
    firstRun: false,
    settingVersion: app.getVersion(),

    lan: "zh-HANS",

    appearance: {
        theme: "system",
        size: { normal: { w: 800, h: 600, m: false } },
    },

    searchEngine: {
        default: "Bing",
        engine: {
            Bing: {
                des: "",
                from: "user",
                img: "https://www.bing.com/favicon.ico",
                url: "https://www.bing.com/search?q=%s",
                sug: "https://api.bing.com/osjson.aspx?query=%s",
            },
            百度: {
                des: "",
                from: "user",
                img: "https://www.baidu.com/favicon.ico",
                url: "https://www.baidu.com/s?wd=%s",
                sug: "http://suggestion.baidu.com/su?wd=%s&action=opensearch&ie=utf-8",
            },
            "360": {
                des: "",
                from: "user",
                img: "https://www.so.com/favicon.ico",
                url: "https://www.so.com/s?src=opensearch&q=%s",
                sug: "",
            },
            搜狗搜索: {
                des: "",
                from: "user",
                img: "https://www.sogou.com/images/logo/new/favicon.ico?v=4",
                url: "https://www.sogou.com/web?query=%s&ie=utf8",
                sug: "",
            },
        },
    },
    windows: { desktop: [], fixed: [] },
};

function matchBestLan() {
    const supportLan = getLans();

    for (const lan of app.getPreferredSystemLanguages()) {
        const l = matchFitLan(lan, supportLan, "");
        if (l) return l;
    }
    return "zh-HANS";
}

function setDefaultSetting() {
    for (const i in defaultSetting) {
        if (i === "语言") {
            const language = matchBestLan();
            store.set(i, { 语言: language });
        } else {
            store.set(i, defaultSetting[i]);
        }
    }
}

// 增加设置项后，防止undefined
function fixSettingTree() {
    if (store.get("设置版本") === app.getVersion() && !dev) return;
    walk([]);
    function walk(path: string[]) {
        const x = path.reduce((o, i) => o[i], defaultSetting);
        for (const i in x) {
            const cPath = path.concat([i]); // push
            if (x[i].constructor === Object) {
                walk(cPath);
            } else {
                const nPath = cPath.join(".");
                if (store.get(nPath) === undefined) store.set(nPath, x[i]);
            }
        }
    }
    store.set("设置版本", app.getVersion());
}
