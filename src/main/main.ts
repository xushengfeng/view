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
import { spawn, exec } from "child_process";
import * as fs from "fs";
import * as os from "os";
import { t, lan } from "../../lib/translate/translate";
import url from "node:url";
import { setting } from "../setting";

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

function renderer_url(file_name: string, q?: Electron.LoadFileOptions) {
    if (!q) {
        q = { query: { config_path: app.getPath("userData") } };
    } else if (!q.query) {
        q.query = { config_path: app.getPath("userData") };
    } else {
        q.query["config_path"] = app.getPath("userData");
    }
    let x: url.URL;
    if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
        let main_url = `${process.env["ELECTRON_RENDERER_URL"]}/${file_name}`;
        x = new url.URL(main_url);
    } else {
        x = new url.URL("file://" + path.join(__dirname, "../renderer", file_name));
    }
    if (q) {
        if (q.search) x.search = q.search;
        if (q.query) {
            for (let i in q.query) {
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

/** BrowserWindow id */
type bwin_id = number;
// 一个browserview对应一个id，不存在history
/** 网页id（包括在同一页面跳转的） */
type view_id = number;
var main_window_l: Map<bwin_id, BrowserWindow> = new Map();
var main_to_search_l: Map<bwin_id, view_id[]> = new Map();
var main_to_chrome: Map<bwin_id, { view: BrowserView; size: "normal" | "hide" | "full" }> = new Map();
var search_window_l: Map<view_id, BrowserView> = new Map();

// 窗口
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
    [id: view_id]: {
        url: string;
        title: string;
        logo: string;
        next?: { new: boolean; id: view_id }[];
    };
};

var tree_text_store = new Store({ name: "text" });
let tree_store = new Store({ name: "tree" });

if (!fs.existsSync(path.join(app.getPath("userData"), "capture"))) {
    fs.mkdirSync(path.join(app.getPath("userData"), "capture"));
}

function get_real_url(url: string) {
    if (url.startsWith("view")) {
        let h = url.replace(/^view:\/\//, "");
        return renderer_url(h + ".html");
    } else {
        return url;
    }
    // TODO 改变location和new URL
}

/** 创建浏览器页面 */
async function create_browser(window_name: number, url: string) {
    let main_window = main_window_l.get(window_name);
    let chrome = main_to_chrome.get(window_name).view;

    if (main_window.isDestroyed()) return;
    let view_id: view_id = new Date().getTime();

    tree_store.set(String(view_id), { logo: "", url: url, title: "" });

    let op: Electron.BrowserViewConstructorOptions = {
        webPreferences: {
            preload: path.join(__dirname, "../preload", "view.js"),
        },
    };
    if (url.startsWith("view://")) {
        op.webPreferences.nodeIntegration = true;
        op.webPreferences.contextIsolation = false;
        op.webPreferences.webSecurity = false;
    }

    let search_view = new BrowserView(op);
    search_window_l.set(view_id, search_view);
    main_window.addBrowserView(search_view);
    main_window.setTopBrowserView(chrome);
    const wc = search_view.webContents;
    const real_url = get_real_url(url);
    wc.loadURL(real_url);
    var [w, h] = main_window.getContentSize();
    search_view.setBounds(get_size(w, h));
    main_window.setContentSize(w, h + 1);
    main_window.setContentSize(w, h);
    wc.setWindowOpenHandler(({ url }) => {
        create_browser(window_name, url).then((id) => {
            let l = (tree_store.get(`${view_id}.next`) as tree[0]["next"]) || [];
            l.push({ id, new: true });
            tree_store.set(`${view_id}.next`, l);
        });
        return { action: "deny" };
    });
    if (dev) wc.openDevTools();
    if (!chrome.webContents.isDestroyed()) chrome.webContents.send("win", "bview_id", view_id);
    if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "new", url);
    wc.on("destroyed", () => {
        main_window.removeBrowserView(search_view);
        search_window_l.delete(view_id);
    });
    wc.on("page-title-updated", (event, title) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "title", title);
        tree_store.set(`${view_id}.title`, title);
    });
    wc.on("page-favicon-updated", (event, favlogo) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "icon", favlogo);
        tree_store.set(`${view_id}.logo`, favlogo[0]);
    });
    wc.on("will-navigate", (event) => {
        create_browser(window_name, event.url).then((id) => {
            let l = (tree_store.get(`${view_id}.next`) as tree[0]["next"]) || [];
            l.push({ id, new: false });
            tree_store.set(`${view_id}.next`, l);
        });
        event.preventDefault();
    });
    wc.on("did-navigate", (event, url) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "url", url);
    });
    wc.on("did-navigate-in-page", (event, url, isMainFrame) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "url", url);
        if (isMainFrame) tree_store.set(`${view_id}.url`, url);
    });
    wc.on("did-start-loading", () => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "load", true);
    });
    wc.on("did-stop-loading", () => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "load", false);
    });
    wc.on("did-fail-load", (event, err_code, err_des) => {
        renderer_path(wc, "browser_bg.html", {
            query: { type: "did-fail-load", err_code: String(err_code), err_des },
        });
        if (dev) wc.openDevTools();
    });
    async function save_pic() {
        let image = await wc.capturePage();
        fs.writeFile(
            path.join(app.getPath("userData"), "capture", view_id + ".jpg"),
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
    wc.on("blur", () => save_pic);
    wc.on("did-finish-load", async () => {
        save_pic();

        tree_text_store.set(String(view_id), await wc.executeJavaScript("document.body.innerText"));
    });
    wc.on("render-process-gone", () => {
        renderer_path(wc, "browser_bg.html", { query: { type: "render-process-gone" } });
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
        renderer_path(wc, "browser_bg.html", { query: { type: "certificate-error" } });
        if (dev) wc.openDevTools();
    });

    wc.on("context-menu", (e, p) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("win", "menu", p);
    });

    wc.session.on("will-download", (e, i) => {
        e.preventDefault();
        download(i.getURL());
    });

    wc.session.setPermissionCheckHandler((w, p, ro) => {
        return true;
    });
    wc.session.setPermissionRequestHandler((w, p, cb) => {
        chrome.webContents.send("site_about", p, w.getURL());
        ipcMain.on("site_about", (_e, a, pp, b) => {
            if (a == w.getURL() && pp == p) {
                cb(b);
            }
        });
    });

    wc.on("update-target-url", (_e, url) => {
        wc.send("view_event", "target_url", url);
    });

    wc.on("devtools-open-url", (_e, url) => {
        create_browser(window_name, url).then((id) => {
            let l = (tree_store.get(`0.next`) as tree[0]["next"]) || [];
            l.push({ id, new: true });
            tree_store.set(`0.next`, l);
        });
    });

    wc.on("zoom-changed", (_e, d) => {
        let l = wc.zoomFactor;
        let x = l + (d == "in" ? 0.1 : -0.1);
        x = Math.min(5, Math.max(0.2, x));
        wc.setZoomFactor(x);
        chrome.webContents.send("win", "zoom", x);
    });

    return view_id;
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
            // 获取BrowserWindow并提升bview
            main_to_search_l.forEach((bvs, id) => {
                for (let i of bvs) {
                    if (i == arg2) {
                        main_window_l.get(id).setTopBrowserView(search_window_l.get(i));
                        main_window_l.get(id).setTopBrowserView(main_to_chrome.get(id).view);
                        main_window_l.get(id).moveTop();
                        main_window_l.get(id).focus();
                    }
                }
            });
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

ipcMain.on("view", (_e, type, arg) => {
    switch (type) {
        case "opensearch":
            console.log(arg);
            for (let i in arg) {
                store.set(`searchEngine.engine.${i}`, arg[i]);
            }
            break;
    }
});

ipcMain.on("theme", (e, v) => {
    nativeTheme.themeSource = v;
    store.set("全局.深色模式", v);
});

let aria2_port = NaN;
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
    return new Promise((re, rj) => {
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
            let has = 0,
                t = 0;
            let al = (await aria2("tellActive", [])) as any[];
            for (let i of al) {
                has += i.completedLength;
                t += i.totalLength;
            }
            let wl = (await aria2("tellActive", [])) as any[];
            for (let i of wl) {
                t += i.totalLength;
            }
            for (let i of main_window_l.values()) {
                i.setProgressBar(has / t);
            }
        }
    }, 500);
}

async function download(url: string) {
    if (!aria2_port) await aria2_start();
    aria2("addUri", [[url]]);
    check_global_aria2_run = true;
    check_global_aria2();
}

// 默认设置
var default_setting: setting = {
    firstRun: false,
    settingVersion: app.getVersion(),

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
