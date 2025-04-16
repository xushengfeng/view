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
import type { setting, DownloadItem, cardData, syncView, treeItem, bwin_id, view_id, VisitId } from "../types";
import { mainOn, mainSend, renderSend } from "../../lib/ipc";
const Keyv = require("keyv").default as typeof import("keyv").default;
const KeyvSqlite = require("@keyv/sqlite").default as typeof import("@keyv/sqlite").default;

const store = new Store();

let /** 是否开启开发模式 */ dev: boolean;

let the_icon = path.join(run_path, "assets/logo/1024x1024.png");
if (process.platform === "win32") {
    the_icon = path.join(run_path, "assets/logo/icon.ico");
}

const isMac = process.platform === "darwin";

const winL: Map<bwin_id, BrowserWindow> = new Map();
// 不同的view分配到窗口
const winToViewl: Map<bwin_id, view_id[]> = new Map();
const winToChrome: Map<bwin_id, { view: BrowserView; size: "normal" | "hide" | "full" }> = new Map();
const viewL: Map<view_id, BrowserView> = new Map();
const winToPasswd: Map<BrowserWindow, BrowserView> = new Map();

const permissionCb = new Map<view_id, Map<string, (isGranted: boolean) => void>>();

const keyvSqlite = new KeyvSqlite(`sqlite://${app.getPath("userData")}/visit.sqlite`);
const treeVisitKeyv = new Keyv({ store: keyvSqlite });
const keyvSqlite1 = new KeyvSqlite(`sqlite://${app.getPath("userData")}/tree.sqlite`);
const treeKeyv = new Keyv({ store: keyvSqlite1 });
const keyvSqlite2 = new KeyvSqlite(`sqlite://${app.getPath("userData")}/name.sqlite`);
const nameKeyv = new Keyv({ store: keyvSqlite2 });

const visitStore = {
    set: (id: VisitId, view: view_id, value: string) => {
        // todo 追加
        // todo 同view之间diff压缩
        return treeVisitKeyv.set(String(id), { view: String(view), text: value });
    },
    get: (id: VisitId) => {
        return treeVisitKeyv.get(String(id));
    },
};
const treeStore = {
    set: async (id: view_id, key: keyof treeItem, value) => {
        // todo yjs sync
        const data = (await treeKeyv.get(String(id))) || {};
        data[key] = value;
        return treeKeyv.set(String(id), data);
    },
    get: (id: view_id) => {
        return treeKeyv.get(String(id)) as Promise<treeItem>;
    },
};
const nameStore = {
    set: async (id: view_id, name: string) => {
        return nameKeyv.set(String(id), name);
    },
    get: (id: view_id) => {
        return nameKeyv.get(String(id)) as Promise<string>;
    },
};

// @ts-ignore
const download_store = new Store({ name: "download" });

let aria2_port = Number.NaN;
const aria2_f = path.join(run_path, "extra", process.platform, process.arch, "engine", "aria2c");
const aria2_conf = path.join(run_path, "extra", process.platform, process.arch, "engine", "aria2.conf");

let aria2_p: ReturnType<typeof spawn>;

let check_global_aria2_run = false;

function log(...params: unknown[]) {
    if (dev) console.log(...params);
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
function rendererPath(window: BrowserWindow | Electron.WebContents, file_name: string, q?: Electron.LoadFileOptions) {
    window.loadURL(renderer_url(file_name, q));
}

function get_size(w: number, h: number) {
    return { x: 0, y: 0, width: w, height: h };
}
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
        width: store.get("appearance.size.normal.w") || 800,
        height: store.get("appearance.size.normal.h") || 600,
        maximizable: store.get("appearance.size.normal.m") || false,
    }) as BrowserWindow & { html: string };
    winL.set(window_name, main_window);

    winToViewl.set(window_name, []);

    main_window.on("close", () => {
        store.set("appearance.size.normal", {
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
                if (i === chrome) setChromeSize(window_name);
            }
        }, 0);
    });

    main_window.on("maximize", () => {
        mainSend(chrome.webContents, "chromeState", ["max"]);
    });
    main_window.on("unmaximize", () => {
        mainSend(chrome.webContents, "chromeState", ["unmax"]);
    });
    main_window.on("enter-full-screen", () => {
        mainSend(chrome.webContents, "fullScreen", [true]);
    });
    main_window.on("leave-full-screen", () => {
        mainSend(chrome.webContents, "fullScreen", [false]);
    });

    const chrome = new BrowserView({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
        },
    });
    rendererPath(chrome.webContents, "frame.html", {
        query: { id: window_name.toString(), userData: app.getPath("userData") },
    });
    if (dev) chrome.webContents.openDevTools();
    main_window.addBrowserView(chrome);
    winToChrome.set(window_name, { view: chrome, size: "full" });
    setChromeSize(window_name);
    mainSend(chrome.webContents, "chromeState", [store.get("appearance.size.normal.m") ? "max" : "unmax"]);

    return window_name;
}

function setChromeSize(pid: bwin_id) {
    const main_window = winL.get(pid);
    const x = winToChrome.get(pid);
    if (!main_window || !x) {
        console.log(`x find window ${pid}`);
        return;
    }
    const o = { full: main_window.getContentSize()[1], normal: 24, hide: 0 };
    x.view.setBounds({
        x: 0,
        y: 0,
        width: main_window.getContentSize()[0],
        height: o[x.size],
    });
}

function get_real_url(url: string) {
    if (url.startsWith("view://")) {
        let h = url.replace(/^view:\/\//, "");
        h = h.replace(/(^\w+)/, "$1.html");
        return renderer_url(h);
    }
    if (url.startsWith("file://")) {
        const p = decodeURIComponent(url.replace(/^file:\/\//, ""));
        try {
            const stat = fs.statSync(p);
            if (stat.isFile()) {
                return renderer_url(`view.html?path=${p}`);
            }
            return renderer_url(`file.html?path=${p}`);
        } catch (error) {
            // todo bg报错
        }
    }
    return url;
    // TODO 改变location和new URL
}

/** 创建浏览器页面 */
async function createView(_window_name: bwin_id, url: string, pid?: view_id, id?: view_id) {
    let window_name = _window_name;
    let main_window = winL.get(window_name);
    const chrome = winToChrome.get(window_name)?.view;

    if (!main_window || main_window.isDestroyed()) {
        window_name = await createWin();
        main_window = winL.get(window_name);
    }

    if (!main_window || !chrome) return;

    const view_id = id ?? (new Date().getTime() as view_id);
    const visitId = new Date().getTime() as VisitId;

    treeStore.set(view_id, "url", url);
    const visits = (await treeStore.get(view_id))?.visits || [];
    visits.push(visitId);
    treeStore.set(view_id, "visits", visits);

    const op: Electron.BrowserViewConstructorOptions = {
        webPreferences: {
            nodeIntegrationInSubFrames: true,
            preload: path.join(__dirname, "../preload", "view.js"),
        },
    };
    if (url.startsWith("view://") || url.startsWith("file://")) {
        if (op.webPreferences) {
            op.webPreferences.nodeIntegration = true;
            op.webPreferences.contextIsolation = false;
            op.webPreferences.webSecurity = false;
            op.webPreferences.preload = undefined;
        }
    }

    const search_view = new BrowserView(op);
    search_view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#0f0f0f" : "#ffffff");
    viewL.set(view_id, search_view);
    main_window.addBrowserView(search_view);
    main_window.setTopBrowserView(chrome);
    winToViewl.get(window_name)?.push(view_id);
    const wc = search_view.webContents;
    const real_url = get_real_url(url);
    log("create view", url, real_url);
    wc.loadURL(real_url);
    const [w, h] = main_window.getContentSize();
    search_view.setBounds(get_size(w, h));
    main_window.setContentSize(w, h + 1);
    main_window.setContentSize(w, h);
    wc.setWindowOpenHandler(({ url, disposition }) => {
        // todo 识别更多类型，比如登录验证
        log("window open", url, disposition);
        if (disposition === "other") {
            // todo picture in picture?
            return {
                action: "allow",
                createWindow(options) {
                    console.log(options);

                    const b = new BrowserWindow(options);
                    return b.webContents;
                },
            };
        }
        createView(window_name, url, view_id);
        return { action: "deny" };
    });
    if (dev) wc.openDevTools();
    if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", view_id, "new", url);
    sendViews("update", view_id, undefined, undefined, { url: url });
    wc.on("destroyed", () => {
        log("view destroyed", view_id);
        main_window.removeBrowserView(search_view);
        viewL.delete(view_id);
    });
    wc.on("page-title-updated", (_event, title) => {
        log("page title updated", title);
        treeStore.set(view_id, "title", title);

        sendViews("update", view_id, undefined, undefined, { title });
    });
    wc.on("page-favicon-updated", (_event, favlogo) => {
        log("page favicon updated", favlogo[0]);
        treeStore.set(view_id, "logo", favlogo[0]);
        sendViews("update", view_id, undefined, undefined, { icon: favlogo[0] });
    });
    wc.on("will-navigate", (event) => {
        log("will navigate", event.url);
        if (decodeURIComponent(event.url) !== decodeURIComponent(real_url)) {
            createView(window_name, event.url, view_id);
            event.preventDefault();
        }
    });
    wc.on("did-navigate", (_event, _url) => {
        log("did navigate", _url);
        if (_url !== real_url) sendViews("update", view_id, undefined, undefined, { url: _url });
        else sendViews("update", view_id, undefined, undefined, { url: url });
    });
    wc.on("did-navigate-in-page", (_event, url, isMainFrame) => {
        if (isMainFrame) {
            treeStore.set(view_id, "url", url);
            sendViews("update", view_id, undefined, undefined, { url: url });
        }
        log("did navigate in page", url, isMainFrame);
    });
    wc.on("did-start-loading", () => {
        sendViews("update", view_id, undefined, undefined, { loading: true });
    });
    wc.on("did-stop-loading", () => {
        sendViews("update", view_id, undefined, undefined, { loading: false });
    });
    wc.on("did-fail-load", (_event, err_code, err_des) => {
        rendererPath(wc, "browser_bg.html", {
            query: { type: "did-fail-load", err_code: String(err_code), err_des },
        });
        if (dev) wc.openDevTools();
    });
    async function save_pic() {
        const image = await wc.capturePage();
        fs.writeFile(
            path.join(app.getPath("userData"), "capture", `${view_id}.jpg`),
            // @ts-ignore
            image
                .resize({
                    height: Math.floor(image.getSize().height / 2),
                    width: Math.floor(image.getSize().width / 2),
                })
                .toJPEG(9),
            (err) => {
                if (err) return;
            },
        );
    }
    wc.on("blur", () => save_pic);
    wc.on("did-finish-load", async () => {
        save_pic();

        visitStore.set(visitId, view_id, await wc.executeJavaScript("document.body.innerText"));

        if (url.startsWith("view://download")) {
            if (aria2_port) {
                wc.send("download", "port", aria2_port);
            } else {
                wc.send("download", "port", await aria2_start());
            }
        }
    });
    wc.on("render-process-gone", () => {
        rendererPath(wc, "browser_bg.html", {
            query: { type: "render-process-gone" },
        });
        if (dev) wc.openDevTools();
    });
    wc.on("unresponsive", () => {
        rendererPath(wc, "browser_bg.html", { query: { type: "unresponsive" } });
        if (dev) wc.openDevTools();
    });
    wc.on("responsive", () => {
        wc.loadURL(url);
    });
    wc.on("certificate-error", () => {
        rendererPath(wc, "browser_bg.html", {
            query: { type: "certificate-error" },
        });
        if (dev) wc.openDevTools();
    });

    wc.on("context-menu", (_e, p) => {
        if (!chrome.webContents.isDestroyed()) mainSend(chrome.webContents, "showMenu", [p]);
    });

    wc.session.on("will-download", (e, i) => {
        e.preventDefault();
        download(i.getURL());
    });

    wc.session.setPermissionCheckHandler((_w, _p, _ro) => {
        return getPermission(url, _p) === "allow";
    });
    wc.session.setPermissionRequestHandler((w, p, cb) => {
        const pe = getPermission(url, p);
        if (pe === "allow") {
            cb(true);
        } else if (pe === "deny") {
            cb(false);
        } else {
            chrome.webContents.send("site_about", p, w.getURL(), view_id);
            const cbMap = permissionCb.get(view_id) ?? new Map();
            cbMap.set(p, cb);
            permissionCb.set(view_id, cbMap);
        }
    });

    wc.on("update-target-url", (_e, url) => {
        mainSend(wc, "urlTip", [url]);
    });

    wc.on("devtools-open-url", (_e, url) => {
        createView(window_name, url, view_id);
    });

    wc.on("zoom-changed", (_e, d) => {
        const l = wc.zoomFactor;
        let x = l + (d === "in" ? 0.1 : -0.1);
        x = Math.min(5, Math.max(0.2, x));
        wc.setZoomFactor(x);
        mainSend(chrome.webContents, "zoom", [x]);
    });

    if (id) {
        sendViews("restart", view_id, undefined, undefined, undefined);
        return id;
    }

    if (pid !== undefined) {
        const l = (await treeStore.get(pid))?.next || [];
        l.push(view_id);
        treeStore.set(pid, "next", l);
        treeStore.set(view_id, "parent", pid);
        sendViews("add", view_id, pid, undefined, undefined);
    }

    return view_id;
}

function sendViews(type: syncView, id: number, pid?: number, wid?: number, op?: cardData) {
    for (const w of winL) {
        const chrome = winToChrome.get(w[0])?.view;
        chrome?.webContents.send("view", type, id, pid, wid, op);
    }
}

function getPermission(url: string, permission: string): "allow" | "deny" | "ask" {
    if (!url.startsWith("view://") || !url.startsWith("https://")) return "deny";
    const defaultP: Record<
        // @ts-ignore
        Parameters<Parameters<Electron.Session["setPermissionRequestHandler"]>[0]>[1],
        "allow" | "deny" | "ask"
    > = {
        "clipboard-read": "ask",
        "clipboard-sanitized-write": "ask",
        "display-capture": "ask",
        fullscreen: "ask",
        geolocation: "ask",
        "idle-detection": "ask",
        media: "ask",
        mediaKeySystem: "ask",
        midi: "ask",
        midiSysex: "ask",
        notifications: "ask",
        pointerLock: "ask",
        keyboardLock: "ask",
        openExternal: "ask",
        "speaker-selection": "ask",
        "storage-access": "ask",
        "top-level-storage-access": "ask",
        "window-management": "ask",
        unknown: "ask",
        fileSystem: "ask",
    };
    // todo 匹配网站
    return defaultP[permission];
}

function aria2_start() {
    console.log(aria2_f, aria2_conf);
    const child = spawn(aria2_f, [`--conf-path=${aria2_conf}`, `-d ${app.getPath("downloads")}`]);
    aria2_p = child;
    return new Promise((re: (n: number) => void, rj) => {
        child.stdout.on("data", (data) => {
            console.log(`Received chunk ${data}`);
            if (String(data).includes("listening on TCP port")) {
                aria2_port = Number(String(data).match(/listening on TCP port ([0-9]+)/)?.[1]);
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
                return Number.parseInt(S.replace("px", "")) + (se?.bounds.x || 0);
            }
            if (a === "y") {
                return Number.parseInt(S.replace("px", "")) + (se?.bounds.y || 0);
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

// 自动开启开发者模式
if (process.argv.includes("-d") || import.meta.env.DEV) {
    dev = true;
} else {
    dev = false;
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
                                mainSend(i[1].webContents, "chorme", []);
                                break;
                            }
                        }
                    },
                },
                {
                    label: t("导航"),
                    accelerator: "CmdOrCtrl+tab",
                    click(_i, w) {
                        for (const i of winL) {
                            if (i[1] === w) {
                                mainSend(winToChrome.get(i[0])?.view.webContents, "toggleTree", []);
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

mainOn("win", ([pid, type], e) => {
    console.log(pid, type);
    if (!pid) return;
    const main_window = BrowserWindow.fromWebContents(e.sender);
    if (!main_window) return;
    const chrome = winToChrome.get(pid);
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
            for (const i of winToViewl.get(pid) ?? []) {
                viewL.delete(i);
            }
            winToViewl.delete(pid);
            winToChrome.delete(pid);
            break;
        case "full_chrome":
            if (chrome) chrome.size = "full";
            setChromeSize(pid);
            break;
        case "normal_chrome":
            if (chrome) chrome.size = "normal";
            setChromeSize(pid);
            break;
        case "hide_chrome":
            if (chrome) chrome.size = "hide";
            setChromeSize(pid);
            break;
    }
});

if (!fs.existsSync(path.join(app.getPath("userData"), "capture"))) {
    fs.mkdirSync(path.join(app.getPath("userData"), "capture"));
}

function getW(id: view_id) {
    const searchWindow = viewL.get(id);
    return searchWindow?.webContents;
}

mainOn("treeGet", async ([id]) => await treeStore.get(id));
mainOn("viewClose", ([id]) => {
    getW(id)?.close();
    sendViews("close", id, undefined, undefined, undefined);
});
mainOn("viewStop", ([id]) => {
    getW(id)?.stop();
});
mainOn("viewReload", ([id]) => {
    getW(id)?.reload();
});
mainOn("viewAdd", async ([url], e) => {
    const main_window = BrowserWindow.fromWebContents(e.sender);
    for (const x of winL) {
        const wid = x[0];
        const w = x[1];
        if (w === main_window) {
            createView(wid, url, 0 as view_id);
            break;
        }
    }
});
mainOn("viewFocus", ([id]) => {
    // 获取BrowserWindow并提升bview
    winToViewl.forEach((bvs, bid) => {
        for (const i of bvs) {
            if (i === id) {
                const win = winL.get(bid);
                const chrome = winToChrome.get(bid)?.view;
                const view = viewL.get(id);
                if (!win || !chrome || !view) return;
                win.setTopBrowserView(view);
                win.setTopBrowserView(chrome);
                win.moveTop();
                win.focus();
                return;
            }
        }
    });
});
mainOn("viewReopen", async ([id], e) => {
    const main_window = BrowserWindow.fromWebContents(e.sender);
    for (const x of winL) {
        const wid = x[0];
        const w = x[1];
        if (w === main_window) {
            const url = (await treeStore.get(id)).url;
            createView(wid, url, undefined, id);
            break;
        }
    }
});
mainOn("viewDev", ([id]) => {
    getW(id)?.openDevTools();
});
mainOn("viewInspect", ([id, { x, y }]) => {
    getW(id)?.inspectElement(x, y);
});
mainOn("download", ([url]) => {
    download(url);
});
mainOn("viewPermission", ([id, arg2]) => {
    permissionCb.get(id)?.get(arg2.type)?.(arg2.allow);
});
mainOn("addOpensearch", ([engine]) => {
    console.log(engine);
    for (const i in engine) {
        store.set(`searchEngine.engine.${i}`, engine[i]);
    }
});
mainOn("input", ([arg], e) => {
    const main_window = BrowserWindow.fromWebContents(e.sender);
    console.log(arg);

    if (!main_window) return;

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
        rendererPath(bv.webContents, "passwd.html");
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
});

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

            if (!main_window) return;

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
                rendererPath(bv.webContents, "passwd.html");
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
