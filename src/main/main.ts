/// <reference types="vite/client" />
// Modules to control application life and create native browser window
import {
    app,
    Tray,
    Menu,
    clipboard,
    globalShortcut,
    BrowserWindow,
    ipcMain,
    dialog,
    Notification,
    shell,
    nativeImage,
    nativeTheme,
    BrowserView,
    screen,
    desktopCapturer,
    session,
} from "electron";
import { Buffer } from "buffer";
const Store = require("electron-store");
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

if (!store.get("硬件加速")) {
    app.disableHardwareAcceleration();
}

app.commandLine.appendSwitch("enable-experimental-web-platform-features", "enable");

app.whenReady().then(() => {
    if (store.get("首次运行") === undefined) set_default_setting();
    fix_setting_tree();

    // 初始化设置
    Store.initRenderer();

    // tmp目录
    if (!fs.existsSync(os.tmpdir() + "/eSearch")) fs.mkdir(os.tmpdir() + "/eSearch", () => {});

    nativeTheme.themeSource = store.get("全局.深色模式");

    // 菜单栏设置
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
                {
                    label: t("保存到历史记录"),
                    click: (i, w) => {
                        main_edit(w, "save");
                    },
                    accelerator: "CmdOrCtrl+S",
                },
                { type: "separator" },
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
                {
                    label: t("其他编辑器打开"),
                    click: (i, w) => {
                        main_edit(w, "edit_on_other");
                    },
                },
                {
                    label: t("打开方式..."),
                    click: (i, w) => {
                        main_edit(w, "choose_editer");
                    },
                },
                { type: "separator" },
                { label: t("关闭"), role: "close" },
            ],
        },
        // { role: 'editMenu' }
        {
            label: t("编辑"),
            submenu: [
                {
                    label: t("打开链接"),
                    click: (i, w) => {
                        main_edit(w, "link");
                    },
                    accelerator: "CmdOrCtrl+Shift+L",
                },
                {
                    label: t("搜索"),
                    click: (i, w) => {
                        main_edit(w, "search");
                    },
                    accelerator: "CmdOrCtrl+Shift+S",
                },
                {
                    label: t("翻译"),
                    click: (i, w) => {
                        main_edit(w, "translate");
                    },
                    accelerator: "CmdOrCtrl+Shift+T",
                },
                { type: "separator" },
                {
                    label: t("撤销"),
                    click: (i, w) => {
                        main_edit(w, "undo");
                        w.webContents.undo();
                    },
                    accelerator: "CmdOrCtrl+Z",
                },
                {
                    label: t("重做"),
                    click: (i, w) => {
                        main_edit(w, "redo");
                        w.webContents.redo();
                    },
                    accelerator: isMac ? "Cmd+Shift+Z" : "Ctrl+Y",
                },
                { type: "separator" },
                {
                    label: t("剪切"),
                    click: (i, w) => {
                        main_edit(w, "cut");
                        w.webContents.cut();
                    },
                    accelerator: "CmdOrCtrl+X",
                },
                {
                    label: t("复制"),
                    click: (i, w) => {
                        main_edit(w, "copy");
                        w.webContents.copy();
                    },
                    accelerator: "CmdOrCtrl+C",
                },
                {
                    label: t("粘贴"),
                    click: (i, w) => {
                        main_edit(w, "paste");
                        w.webContents.paste();
                    },
                    accelerator: "CmdOrCtrl+V",
                },
                {
                    label: t("删除"),
                    click: (i, w) => {
                        main_edit(w, "delete");
                        w.webContents.delete();
                    },
                },
                {
                    label: t("全选"),
                    click: (i, w) => {
                        main_edit(w, "select_all");
                        w.webContents.selectAll();
                    },
                    accelerator: "CmdOrCtrl+A",
                },
                {
                    label: t("自动删除换行"),
                    click: (i, w) => {
                        main_edit(w, "delete_enter");
                    },
                },
                { type: "separator" },
                {
                    label: t("查找"),
                    click: (i, w) => {
                        main_edit(w, "show_find");
                    },
                    accelerator: "CmdOrCtrl+F",
                },
                {
                    label: t("替换"),
                    click: (i, w) => {
                        main_edit(w, "show_find");
                    },
                    accelerator: isMac ? "CmdOrCtrl+Option+F" : "CmdOrCtrl+H",
                },
                { type: "separator" },
                {
                    label: t("自动换行"),
                    click: (i, w) => {
                        main_edit(w, "wrap");
                    },
                },
                {
                    label: t("拼写检查"),
                    click: (i, w) => {
                        main_edit(w, "spellcheck");
                    },
                },
                { type: "separator" },
                ...(isMac
                    ? [
                          {
                              label: t("朗读"),
                              submenu: [
                                  { label: t("开始朗读"), role: "startSpeaking" },
                                  { label: t("停止朗读"), role: "stopSpeaking" },
                              ],
                          },
                      ]
                    : []),
            ],
        },
        {
            label: t("浏览器"),
            submenu: [
                {
                    label: t("后退"),
                    click: (i, w) => {
                        view_events(w, "back");
                    },
                    accelerator: isMac ? "Command+[" : "Alt+Left",
                },
                {
                    label: t("前进"),
                    click: (i, w) => {
                        view_events(w, "forward");
                    },
                    accelerator: isMac ? "Command+]" : "Alt+Right",
                },
                {
                    label: t("刷新"),
                    click: (i, w) => {
                        view_events(w, "reload");
                    },
                    accelerator: "F5",
                },
                {
                    label: t("停止加载"),
                    click: (i, w) => {
                        view_events(w, "stop");
                    },
                    accelerator: "Esc",
                },
                {
                    label: t("浏览器打开"),
                    click: (i, w) => {
                        view_events(w, "browser");
                    },
                },
                {
                    label: t("保存到历史记录"),
                    click: (i, w) => {
                        view_events(w, "add_history");
                    },
                    accelerator: "CmdOrCtrl+D",
                },
                {
                    label: t("开发者工具"),
                    click: (i, w) => {
                        view_events(w, "dev");
                    },
                },
            ],
        },
        // { role: 'viewMenu' }
        {
            label: t("视图"),
            submenu: [
                { label: t("重新加载"), role: "reload" },
                { label: t("强制重载"), role: "forceReload" },
                { label: t("开发者工具"), role: "toggleDevTools" },
                { type: "separator" },
                {
                    label: t("历史记录"),
                    click: (i, w) => {
                        main_edit(w, "show_history");
                    },
                    accelerator: "CmdOrCtrl+Shift+H",
                },
                { type: "separator" },
                { label: t("实际大小"), role: "resetZoom", accelerator: "" },
                { label: t("放大"), role: "zoomIn" },
                { label: t("缩小"), role: "zoomOut" },
                { type: "separator" },
                { label: t("全屏"), role: "togglefullscreen" },
            ],
        },
        // { role: 'windowMenu' }
        {
            label: t("窗口"),
            submenu: [
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

    create_browser(null, "https://www.bing.com");
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
        case "set_default_setting":
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
var main_window_l: { [n: number]: BrowserWindow } = {};
var main_to_search_l: { [n: number]: Array<number> } = {};
var main_to_chrome: { [n: number]: BrowserView } = {};
async function create_main_window() {
    var window_name = new Date().getTime();
    var main_window = (main_window_l[window_name] = new BrowserWindow({
        backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f0f0f" : "#ffffff",
        icon: the_icon,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
        },
        frame: false,
        show: true,
    })) as BrowserWindow & { html: string };

    main_to_search_l[window_name] = [];

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
        delete main_window_l[window_name];
    });

    // 浏览器大小适应
    main_window.on("resize", () => {
        setTimeout(() => {
            var [w, h] = main_window.getContentSize();
            for (let i of main_window.getBrowserViews()) {
                if (i.getBounds().width != 0 && i != chrome) i.setBounds(get_size(w, h));
                if (i == chrome) i.setBounds({ x: 0, y: 0, width: w, height: 24 });
            }
        }, 0);
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
    chrome.setBounds({ x: 0, y: 0, width: main_window.getContentSize()[0], height: 24 });
    main_to_chrome[window_name] = chrome;

    return window_name;
}

function main_edit(window: BrowserWindow, m: string) {
    window.webContents.send("edit", m);
}

var search_window_l: { [n: number]: BrowserView } = {};
ipcMain.on("open_url", (event, window_name, url) => {
    create_browser(window_name, url);
});

/** 创建浏览器页面 */
async function create_browser(window_name: number, url: string) {
    if (!window_name) window_name = await create_main_window();

    var win_name = new Date().getTime();

    let main_window = main_window_l[window_name];
    let chrome = main_to_chrome[window_name];

    if (main_window.isDestroyed()) return;
    min_views(main_window);
    var view = new Date().getTime();
    let security = true;
    for (let i of store.get("nocors")) {
        if (url.includes(i)) {
            security = false;
            break;
        }
    }
    var search_view = (search_window_l[view] = new BrowserView({ webPreferences: { webSecurity: security } }));
    await search_view.webContents.session.setProxy(store.get("代理"));
    main_window_l[window_name].addBrowserView(search_view);
    main_window.setTopBrowserView(chrome);
    search_view.webContents.loadURL(url);
    var [w, h] = main_window.getContentSize();
    search_view.setBounds(get_size(w, h));
    main_window.setContentSize(w, h + 1);
    main_window.setContentSize(w, h);
    search_view.webContents.setWindowOpenHandler(({ url }) => {
        create_browser(window_name, url);
        return { action: "deny" };
    });
    if (dev) search_view.webContents.openDevTools();
    if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", win_name, view, "new", url);
    search_view.webContents.on("page-title-updated", (event, title) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", win_name, view, "title", title);
    });
    search_view.webContents.on("page-favicon-updated", (event, favlogo) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", win_name, view, "icon", favlogo);
    });
    search_view.webContents.on("did-navigate", (event, url) => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", win_name, view, "url", url);
    });
    search_view.webContents.on("did-start-loading", () => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", win_name, view, "load", true);
    });
    search_view.webContents.on("did-stop-loading", () => {
        if (!chrome.webContents.isDestroyed()) chrome.webContents.send("url", win_name, view, "load", false);
    });
    search_view.webContents.on("did-fail-load", (event, err_code, err_des) => {
        renderer_path(search_view.webContents, "browser_bg.html", {
            query: { type: "did-fail-load", err_code: String(err_code), err_des },
        });
        if (dev) search_view.webContents.openDevTools();
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
}
/**
 * 标签页事件
 */
function view_events(w: BrowserWindow, arg: string) {
    w.webContents.send("view_events", arg);
}

ipcMain.on("tab_view", (e, id, arg, arg2) => {
    let main_window = BrowserWindow.fromWebContents(e.sender);
    let search_window = search_window_l[id];
    switch (arg) {
        case "close":
            main_window.removeBrowserView(search_window);
            // @ts-ignore
            search_window.webContents.destroy();
            delete search_window_l[id];
            break;
        case "top":
            // 有时直接把主页面当成浏览器打开，这时pid未初始化就触发top了，直接忽略
            if (!main_window) return;
            main_window.setTopBrowserView(search_window);
            min_views(main_window);
            search_window.setBounds(
                get_size(main_window.getContentBounds().width, main_window.getContentBounds().height)
            );
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
        case "change":
            search_window.webContents.loadURL(arg2);
            break;
        case "home":
            min_views(main_window);
            break;
        case "save_html":
            main_window["html"] = arg2;
            min_views(main_window);
            break;
        case "dev":
            search_window.webContents.openDevTools();
            break;
    }
});

/** 最小化某个窗口的所有标签页 */
function min_views(main_window: BrowserWindow) {
    for (let v of main_window.getBrowserViews()) {
        v.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
}

ipcMain.on("theme", (e, v) => {
    nativeTheme.themeSource = v;
    store.set("全局.深色模式", v);
});

// 默认设置
var default_setting = {
    首次运行: false,
    设置版本: app.getVersion(),
    启动提示: true,
    语言: {},
    快捷键: {
        自动识别: {
            key: "Alt+C",
        },
        截屏搜索: {},
        选中搜索: {},
        剪贴板搜索: {},
        快速截屏: {},
        主页面: {},
    },
    点击托盘自动截图: process.platform != "linux",
    其他快捷键: {
        关闭: "Escape",
        OCR: "Enter",
        以图搜图: "",
        QR码: "",
        图像编辑: isMac ? "Command+D" : "Control+D",
        其他应用打开: "",
        放在屏幕上: "",
        录屏: "",
        长截屏: "",
        复制: isMac ? "Command+C" : "Control+C",
        保存: isMac ? "Command+S" : "Control+S",
        复制颜色: "K",
    },
    主搜索功能: {
        自动搜索排除: [],
        剪贴板选区搜索: true,
        截屏搜索延迟: 0,
    },
    全局: {
        模糊: 25,
        缩放: 1,
        不透明度: 0.4,
        深色模式: "system",
        图标颜色: ["", ""],
    },
    工具栏: {
        按钮大小: 60,
        按钮图标比例: 0.7,
    },
    字体: {
        主要字体: "",
        等宽字体: "",
        记住: false,
        大小: 16,
    },
    编辑器: {
        自动换行: true,
        拼写检查: false,
        行号: true,
        tab: 2,
        光标动画: 0.05,
    },
    工具栏跟随: "展示内容优先",
    取色器默认格式: "HEX",
    自动搜索: true,
    遮罩颜色: "#0008",
    选区颜色: "#0000",
    像素大小: 10,
    取色器大小: 15,
    显示四角坐标: true,
    其他应用打开: "",
    框选: {
        自动框选: {
            开启: false,
            图像识别: false,
            最小阈值: 50,
            最大阈值: 150,
        },
        记忆: { 开启: false, rects: {} },
    },
    图像编辑: {
        默认属性: {
            填充颜色: "#fff",
            边框颜色: "#333",
            边框宽度: 1,
            画笔颜色: "#333",
            画笔粗细: 2,
        },
        复制偏移: {
            x: 10,
            y: 10,
        },
        形状属性: {},
    },
    OCR: {
        类型: "默认",
        离线切换: true,
        记住: false,
    },
    离线OCR: [["默认", "默认/ppocr_det.onnx", "默认/ppocr_rec.onnx", "默认/ppocr_keys_v1.txt"]],
    离线OCR配置: {
        node: false,
    },
    在线OCR: {
        baidu: {
            url: "",
            id: "",
            secret: "",
        },
        youdao: {
            id: "",
            secret: "",
        },
    },
    以图搜图: {
        引擎: "baidu",
        记住: false,
    },
    自动打开链接: false,
    自动搜索中文占比: 0.2,
    浏览器中打开: false,
    浏览器: {
        标签页: {
            自动关闭: true,
            小: false,
            灰度: false,
        },
    },
    保存: {
        默认格式: "png",
        保存路径: { 图片: "", 视频: "" },
        快速保存: false,
    },
    保存名称: { 前缀: "eSearch-", 时间: "YYYY-MM-DD-HH-mm-ss-S", 后缀: "" },
    jpg质量: 1,
    框选后默认操作: "no",
    快速截屏: { 模式: "clip", 路径: "" },
    搜索引擎: [
        ["Google", "https://www.google.com/search?q=%s"],
        ["百度", "https://www.baidu.com/s?wd=%s"],
        ["必应", "https://cn.bing.com/search?q=%s"],
        ["Yandex", "https://yandex.com/search/?text=%s"],
    ],
    翻译引擎: [
        ["Google", "https://translate.google.com.hk/?op=translate&text=%s"],
        ["Deepl", "https://www.deepl.com/translator#any/any/%s"],
        ["金山词霸", "http://www.iciba.com/word?w=%s"],
        ["百度", "https://fanyi.baidu.com/#auto/auto/%s"],
        ["腾讯", "https://fanyi.qq.com/?text=%s"],
        ["翻译树", "https://fanyishu.netlify.app/?text=%s"],
    ],
    引擎: {
        记住: false,
        默认搜索引擎: "百度",
        默认翻译引擎: "Google",
    },
    nocors: ["https://yuansou.netlify.app/"],
    历史记录设置: {
        保留历史记录: true,
        自动清除历史记录: false,
        d: 14,
        h: 0,
    },
    ding_dock: [0, 0],
    贴图: {
        窗口: {
            变换: `transform: rotateY(180deg);`,
            双击: "归位",
        },
    },
    代理: {
        mode: "direct",
        pacScript: "",
        proxyRules: "",
        proxyBypassRules: "",
    },
    主页面大小: [800, 600, false],
    关闭窗口: {
        失焦: { 主页面: false },
    },
    时间格式: "MM/DD hh:mm:ss",
    硬件加速: true,
    更新: {
        检查更新: true,
        频率: "setting",
        dev: false,
        上次更新时间: 0,
    },
    录屏: {
        自动录制: 3,
        视频比特率: 2.5,
        摄像头: {
            默认开启: false,
            记住开启状态: false,
            镜像: false,
        },
        音频: {
            默认开启: false,
            记住开启状态: false,
        },
        转换: {
            ffmpeg: "",
            自动转换: false,
            格式: "webm",
            码率: 2.5,
            帧率: 30,
            其他: "",
            高质量gif: false,
        },
        提示: {
            键盘: {
                开启: false,
            },
            鼠标: {
                开启: false,
            },
            光标: {
                开启: false,
                样式: "width: 24px;\nheight: 24px;\nborder-radius: 50%;\nbackground-color: #ff08;",
            },
        },
    },
    插件: { 加载前: [], 加载后: [] },
};
try {
    default_setting.保存.保存路径.图片 = app.getPath("pictures");
    default_setting.保存.保存路径.视频 = app.getPath("videos");
} catch (e) {
    console.error(e);
}

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
    if (store.get("设置版本") == app.getVersion()) return;
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
