/// <reference types="vite/client" />
// Modules to control application life and create native browser window
import {
    app,
    globalShortcut,
    BrowserWindow,
    ipcMain,
    dialog,
    shell,
    nativeImage,
    nativeTheme,
    BrowserView,
    screen,
    desktopCapturer,
    session,
} from "electron";
const Store = require("electron-store") as typeof import("electron-store");
import * as path from "path";
const run_path = path.join(path.resolve(__dirname, ""), "../../");
import { exec } from "child_process";
import * as fs from "fs";
import * as os from "os";
import { t, lan } from "../../lib/translate/translate";
import url from "node:url";

// 自定义用户路径
try {
    var userDataPath = fs.readFileSync(path.join(run_path, "preload_config")).toString().trim();
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

var store = new Store();

var /** 是否开启开发模式 */ dev: boolean;
// 自动开启开发者模式
if (process.argv.includes("-d") || import.meta.env.DEV) {
    dev = true;
} else {
    dev = false;
}

/** 加载网页 */
function renderer_path(window: BrowserWindow | Electron.WebContents, file_name: string, q?: Electron.LoadFileOptions) {
    if (!q) {
        q = { query: { config_path: app.getPath("userData") } };
    } else if (!q.query) {
        q.query = { config_path: app.getPath("userData") };
    } else {
        q.query["config_path"] = app.getPath("userData");
    }
    if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
        let main_url = `${process.env["ELECTRON_RENDERER_URL"]}/${file_name}`;
        let x = new url.URL(main_url);
        if (q) {
            if (q.search) x.search = q.search;
            if (q.query) {
                for (let i in q.query) {
                    x.searchParams.set(i, q.query[i]);
                }
            }
            if (q.hash) x.hash = q.hash;
        }
        window.loadURL(x.toString());
    } else {
        window.loadFile(path.join(__dirname, "../renderer", file_name), q);
    }
}

app.commandLine.appendSwitch("enable-experimental-web-platform-features", "enable");

app.whenReady().then(() => {
    if (store.get("首次运行") === undefined) set_default_setting();
    fix_setting_tree();

    // 初始化设置
    Store.initRenderer();

    // @ts-ignore
    nativeTheme.themeSource = store.get("全局.深色模式");

    create_main_window();
});

app.on("will-quit", () => {
    // Unregister all shortcuts.
    globalShortcut.unregisterAll();
});

var the_icon = null;
if (process.platform == "win32") {
    the_icon = path.join(run_path, "assets/logo/icon.ico");
} else {
    the_icon = path.join(run_path, "assets/logo/1024x1024.png");
}
ipcMain.on("setting", async (event, arg, arg1, arg2) => {
    switch (arg) {
        case "save_err":
            console.log("保存设置失败");
            break;
            store.clear();
            set_default_setting();
            var resolve = await dialog.showMessageBox({
                title: t("重启"),
                message: `${t("已恢复默认设置，部分设置需要重启")} ${app.name} ${t("生效")}`,
                buttons: [t("重启"), t("稍后")],
                defaultId: 0,
                cancelId: 1,
            });
            if (resolve.response == 0) {
                app.relaunch();
                app.exit(0);
            }
            break;
        case "reload":
            app.relaunch();
            app.exit(0);
            break;
        case "clear":
            let ses = session.defaultSession;
            if (arg1 == "storage") {
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
        case "open_dialog":
            dialog.showOpenDialog(arg1).then((x) => {
                event.sender.send("setting", arg, arg2, x);
            });
            break;
        case "move_user_data":
            if (!arg1) return;
            const to_path = path.resolve(arg1);
            const pre_path = app.getPath("userData");
            fs.mkdirSync(to_path, { recursive: true });
            if (process.platform == "win32") {
                exec(`xcopy ${pre_path}\\** ${to_path} /Y /s`);
            } else {
                exec(`cp -r ${pre_path}/** ${to_path}`);
            }
    }
});

const isMac = process.platform === "darwin";

function get_size(w: number, h: number) {
    return { x: 0, y: 0, width: w, height: h };
}

// 主页面
/** BrowserWindow id */
type bwin_id = number;
/** BrowserView id */
type bview_id = number;
/** 网页id（包括在同一页面跳转的） */
type view_id = number;
var main_window_l: Map<bwin_id, BrowserWindow> = new Map();
var main_to_search_l: Map<bwin_id, bview_id[]> = new Map();
var main_to_chrome: Map<bwin_id, { view: BrowserView; size: "normal" | "hide" | "full" }> = new Map();
async function create_main_window() {
    const window_name = new Date().getTime();
    let main_window = new BrowserWindow({
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
    main_window_l.set(window_name, main_window);

    main_to_search_l.set(window_name, []);

    main_window.on("close", () => {
        store.set("主页面大小", [
            main_window.getNormalBounds().width,
            main_window.getNormalBounds().height,
            main_window.isMaximized(),
        ]);
        for (let i of main_window.getBrowserViews()) {
            // @ts-ignore
            i?.webContents?.destroy();
        }
    });

    main_window.on("closed", () => {
        main_window_l.delete(window_name);
    });

    // 浏览器大小适应
    main_window.on("resize", () => {
        setTimeout(() => {
            var [w, h] = main_window.getContentSize();
            for (let i of main_window.getBrowserViews()) {
                if (i.getBounds().width != 0 && i != chrome) i.setBounds(get_size(w, h));
                if (i == chrome) set_chrome_size(window_name);
            }
        }, 0);
    });

    main_window.on("maximize", () => {
        chrome.webContents.send("win", "max");
    });
    main_window.on("unmaximize", () => {
        chrome.webContents.send("win", "unmax");
    });

    let chrome = new BrowserView({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
        },
    });
    renderer_path(chrome.webContents, "frame.html");
    if (dev) chrome.webContents.openDevTools();
    main_window.addBrowserView(chrome);
    main_to_chrome.set(window_name, { view: chrome, size: "normal" });
    set_chrome_size(window_name);
    chrome.webContents.on("did-finish-load", () => {
        chrome.webContents.send("win", "id", window_name);
        chrome.webContents.send("win", "userData", app.getPath("userData"));
    });

    return window_name;
}

var search_window_l: Map<bview_id, BrowserView> = new Map();

function set_chrome_size(pid: number) {
    let main_window = main_window_l.get(pid);
    let x = main_to_chrome.get(pid);
    let o = { full: main_window.getContentSize()[1], normal: 24, hide: 0 };
    x.view.setBounds({ x: 0, y: 0, width: main_window.getContentSize()[0], height: o[x.size] });
}

ipcMain.on("win", (e, pid, type) => {
    console.log(pid, type);
    let main_window = BrowserWindow.fromWebContents(e.sender);
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
            main_window_l.delete(pid);
            for (let i of main_to_search_l.get(pid)) {
                search_window_l.delete(i);
                bview_view.delete(i);
                bview_now.delete(i);
            }
            main_to_chrome.delete(pid);
            break;
        case "full_chrome":
            main_to_chrome.get(pid).size = "full";
            set_chrome_size(pid);
            break;
        case "normal_chrome":
            main_to_chrome.get(pid).size = "normal";
            set_chrome_size(pid);
            break;
        case "hide_chrrome":
            main_to_chrome.get(pid).size = "hide";
            set_chrome_size(pid);
            break;
    }
});

type tree = {
    [id: number]: {
        url: string;
        title: string;
        logo: string;
        next?: { new: boolean; id: number }[];
    };
};

var tree_text_store = new Store({ name: "text" });
let tree_store = new Store({ name: "tree" });
let tree = (tree_store.get("tree") || {}) as tree;

if (!fs.existsSync(path.join(app.getPath("userData"), "capture"))) {
    fs.mkdirSync(path.join(app.getPath("userData"), "capture"));
}

var bview_view: Map<bview_id, view_id[]> = new Map();
var bview_now: Map<bview_id, view_id> = new Map();

/** 创建浏览器页面 */
async function create_browser(window_name: number, url: string) {
    let main_window = main_window_l.get(window_name);
    let chrome = main_to_chrome.get(window_name).view;

    if (main_window.isDestroyed()) return;
    const view: bview_id = new Date().getTime();
    let tree_id: view_id = new Date().getTime();
    bview_view.set(view, [tree_id]);
    bview_now.set(view, tree_id);

    tree_store.set(String(tree_id), { logo: "", url: url, title: "" });

    let search_view = new BrowserView();
    search_window_l.set(view, search_view);
    main_window.addBrowserView(search_view);
    main_window.setTopBrowserView(chrome);
    search_view.webContents.loadURL(url);
    var [w, h] = main_window.getContentSize();
    search_view.setBounds(get_size(w, h));
    main_window.setContentSize(w, h + 1);
    main_window.setContentSize(w, h);
    search_view.webContents.setWindowOpenHandler(({ url }) => {
        create_browser(window_name, url).then((id) => {
            let l = (tree_store.get(`${tree_id}.next`) as tree[0]["next"]) || [];
            l.push({ id, new: true });
            tree_store.set(`${tree_id}.next`, l);
        });
        return { action: "deny" };
    });
    if (dev) search_view.webContents.openDevTools();
    if (!chrome.webContents.isDestroyed()) chrome.webContents.send("win", "bview_id", view);
    if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", tree_id, "new", url);
    search_view.webContents.on("destroyed", () => {
        main_window.removeBrowserView(search_view);
        search_window_l.delete(view);
        bview_view.delete(view);
        bview_now.delete(view);
    });
    search_view.webContents.on("page-title-updated", (event, title) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", tree_id, "title", title);
        tree_store.set(`${tree_id}.title`, title);
    });
    search_view.webContents.on("page-favicon-updated", (event, favlogo) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", tree_id, "icon", favlogo);
        tree_store.set(`${tree_id}.logo`, favlogo[0]);
    });
    search_view.webContents.on("did-navigate", (event, url) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", tree_id, "url", url);
        let new_id: view_id = new Date().getTime();
        let l = (tree_store.get(`${tree_id}.next`) as tree[0]["next"]) || [];
        l.push({ id: new_id, new: false });
        tree_store.set(`${tree_id}.next`, l);
        bview_view.get(view).push(new_id);
        tree_id = new_id;
        bview_now.set(view, tree_id);
        tree_store.set(String(tree_id), { logo: "", url: url, title: "" });
    });
    search_view.webContents.on("did-navigate-in-page", (event, url, isMainFrame) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", tree_id, "url", url);
        if (isMainFrame) tree_store.set(`${tree_id}.url`, url);
    });
    search_view.webContents.on("did-start-loading", () => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", tree_id, "load", true);
    });
    search_view.webContents.on("did-stop-loading", () => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", tree_id, "load", false);
    });
    search_view.webContents.on("did-fail-load", (event, err_code, err_des) => {
        renderer_path(search_view.webContents, "browser_bg.html", {
            query: { type: "did-fail-load", err_code: String(err_code), err_des },
        });
        if (dev) search_view.webContents.openDevTools();
    });
    async function save_pic() {
        let image = await search_view.webContents.capturePage();
        fs.writeFile(
            path.join(app.getPath("userData"), "capture", tree_id + ".jpg"),
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
            }
        );
    }
    search_view.webContents.on("blur", () => save_pic);
    search_view.webContents.on("did-finish-load", async () => {
        save_pic();

        tree_text_store.set(
            String(tree_id),
            await search_view.webContents.executeJavaScript("document.body.innerText")
        );
    });
    search_view.webContents.on("render-process-gone", () => {
        renderer_path(search_view.webContents, "browser_bg.html", { query: { type: "render-process-gone" } });
        if (dev) search_view.webContents.openDevTools();
    });
    search_view.webContents.on("unresponsive", () => {
        renderer_path(search_view.webContents, "browser_bg.html", { query: { type: "unresponsive" } });
        if (dev) search_view.webContents.openDevTools();
    });
    search_view.webContents.on("responsive", () => {
        search_view.webContents.loadURL(url);
    });
    search_view.webContents.on("certificate-error", () => {
        renderer_path(search_view.webContents, "browser_bg.html", { query: { type: "certificate-error" } });
        if (dev) search_view.webContents.openDevTools();
    });

    return tree_id;
}

ipcMain.on("tab_view", (e, id, arg, arg2) => {
    console.log(arg);

    let main_window = BrowserWindow.fromWebContents(e.sender);
    let search_window = search_window_l.get(id);
    switch (arg) {
        case "close":
            search_window.webContents.close();
            break;
        case "back":
            search_window.webContents.goBack();
            break;
        case "forward":
            search_window.webContents.goForward();
            break;
        case "stop":
            search_window.webContents.stop();
            break;
        case "reload":
            search_window.webContents.reload();
            break;
        case "add":
            main_window_l.forEach((w, id) => {
                if (w == main_window) {
                    create_browser(id, arg2).then((id) => {
                        let l = (tree_store.get(`0.next`) as tree[0]["next"]) || [];
                        l.push({ id, new: true });
                        tree_store.set(`0.next`, l);
                    });
                }
            });
            break;
        case "change":
            search_window.webContents.loadURL(arg2);
            break;
        case "switch":
            bview_view.forEach((views, bv) => {
                if (views.includes(arg2)) {
                    // 获取BrowserWindow并提升bview
                    main_to_search_l.forEach((bvs, id) => {
                        if (bvs.includes(bv)) {
                            main_window_l.get(id).setTopBrowserView(search_window_l.get(bv));
                            main_window_l.get(id).setTopBrowserView(main_to_chrome.get(id).view);
                            main_window_l.get(id).moveTop();
                            main_window_l.get(id).focus();
                        }
                    });
                    if (!bview_now.get(bv) == arg2) {
                        search_window_l.get(bv).webContents.loadURL(tree[arg2].url);
                    }
                }
            });
            break;
        case "dev":
            search_window.webContents.openDevTools();
            break;
    }
});

ipcMain.on("theme", (e, v) => {
    nativeTheme.themeSource = v;
    store.set("全局.深色模式", v);
});

// 默认设置
var default_setting = {
    firstRun: false,
    settingVersion: app.getVersion(),
};

function set_default_setting() {
    for (let i in default_setting) {
        if (i == "语言") {
            store.set(i, { 语言: app.getLocale() || "zh-HANS" });
        } else {
            store.set(i, default_setting[i]);
        }
    }
}

// 增加设置项后，防止undefined
function fix_setting_tree() {
    if (store.get("settingVersion") == app.getVersion()) return;
    var tree = "default_setting";
    walk(tree);
    function walk(path: string) {
        var x = eval(path);
        if (Object.keys(x).length == 0) {
            path = path.slice(tree.length + 1); /* 去除开头主tree */
            if (store.get(path) === undefined) store.set(path, x);
        } else {
            for (let i in x) {
                var c_path = path + "." + i;
                if (x[i].constructor === Object) {
                    walk(c_path);
                } else {
                    c_path = c_path.slice(tree.length + 1); /* 去除开头主tree */
                    if (store.get(c_path) === undefined) store.set(c_path, x[i]);
                }
            }
        }
    }
}
