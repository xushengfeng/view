/// <reference types="vite/client" />

const { ipcRenderer, clipboard } = require("electron") as typeof import("electron");
const Store = require("electron-store") as typeof import("electron-store");
import type { setting } from "../../types";

const setting = new Store().store as unknown as setting;

import minimize_svg from "../assets/icons/minimize.svg";
import maximize_svg from "../assets/icons/maximize.svg";
import unmaximize_svg from "../assets/icons/unmaximize.svg";
import close_svg from "../assets/icons/close.svg";
import left_svg from "../assets/icons/left.svg";
import right_svg from "../assets/icons/right.svg";
import reload_svg from "../assets/icons/reload.svg";
import browser_svg from "../assets/icons/browser.svg";
import search_svg from "../assets/icons/search.svg";
import add_svg from "../assets/icons/add.svg";

function icon(src: string) {
    return `<img src="${src}" class="icon">`;
}

function create_div() {
    return document.createElement("div");
}

/** browserwindow id */
let pid = Number.NaN;

let chrome_size: "normal" | "hide" | "full" = "normal";
const chrome_size_fixed = false;

/** 用户目录 */
let userDataPath = "";

const w_mini = document.createElement("div");
const w_max = document.createElement("div");
const w_close = document.createElement("div");

const system_el = document.getElementById("system_right");

w_mini.innerHTML = icon(minimize_svg);
w_max.innerHTML = icon(maximize_svg);
w_close.innerHTML = icon(close_svg);
w_mini.onclick = () => {
    ipcRenderer.send("win", pid, "mini");
    set_chrome_size("hide");
};
w_max.onclick = () => {
    ipcRenderer.send("win", pid, "max");
    set_chrome_size("hide");
};
w_close.onclick = () => {
    ipcRenderer.send("win", pid, "close");
};

system_el.append(w_mini, w_max, w_close);

ipcRenderer.on("win", (e, a, arg) => {
    switch (a) {
        case "max":
            w_max.innerHTML = icon(unmaximize_svg);
            break;
        case "unmax":
            w_max.innerHTML = icon(maximize_svg);
            break;
        case "id":
            pid = arg;
            break;
        case "userData":
            userDataPath = arg;
            break;
        case "menu":
            console.log(arg);
            menu(arg);
            break;
        case "zoom":
            console.log(arg);
            // TODO show
            break;
        case "chrome_toggle":
            if (chrome_size === "hide") {
                set_chrome_size("normal");
            } else if (chrome_size === "normal") {
                set_chrome_size("hide");
            }
            break;
    }
});

const buttons = document.getElementById("buttoms");
const url_el = document.getElementById("url");

const b_reload = document.createElement("div");
b_reload.innerHTML = icon(reload_svg);
b_reload.onclick = () => {
    ipcRenderer.send("tab_view", topestView, "reload");
    set_chrome_size("hide");
};

const show_tree = document.createElement("div");
show_tree.innerHTML = icon(reload_svg);
show_tree.onclick = () => {
    set_chrome_size("full");
    render_tree();
};

buttons.append(b_reload, show_tree);

function set_chrome_size(type: "normal" | "hide" | "full") {
    if (type === "hide" && chrome_size_fixed) {
        type = "normal";
    }
    chrome_size = type;
    ipcRenderer.send("win", pid, `${type}_chrome`);
    if (type === "normal") {
        search_list_el.innerHTML = "";
    }
}

let now_url = "about:blank";

function set_url(url: string) {
    now_url = url;
    try {
        let x = new URL(url);
        if (location.href.split("/").slice(0, -1).join("/") === x.href.split("/").slice(0, -1).join("/")) {
            x = new URL(`view://${x.pathname.split("/").at(-1).replace(".html", "")}`);
        }
        const hurl = x.toString();
        let ss = 0;
        let se = hurl.length;
        if (hurl.indexOf(".") !== -1) {
            ss = hurl.indexOf(".") + 1;
        } else {
            ss = hurl.indexOf("://") + 3;
        }
        for (let i = ss; i < hurl.length; i++) {
            const element = hurl[i];
            if (!element.match(/[a-zA-Z.]/)) {
                se = i;
            }
        }
        const l0 = hurl.slice(0, ss);
        const h = hurl.slice(ss, se);
        const l1 = hurl.slice(se);
        const m = document.createElement("span");
        m.innerText = h;
        url_el.innerHTML = "";
        url_el.append(l0, m, l1);
    } catch (error) {
        const m = document.createElement("span");
        m.innerText = url;
        url_el.innerHTML = "";
        url_el.append(m);
    }
}

let activeViews = [];
const myViews = [];
let topestView = Number.NaN;

ipcRenderer.on("url", (e, view, type, arg) => {
    switch (type) {
        case "new":
            topestView = view;
            activeViews.push(view);
            myViews.push(view);
            if (chrome_size !== "full") set_chrome_size("normal");
            break;
        case "url":
            if (view === topestView) {
                set_url(arg);
            }
            break;
        case "load":
            if (arg) {
            } else {
                if (chrome_size !== "full" && !chrome_size_fixed) set_chrome_size("hide");
            }
            break;
    }
});

const search_list_el = document.getElementById("search_list");
let url_i: HTMLInputElement;
url_el.onpointerdown = (e) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    e.preventDefault();
    url_i = document.createElement("input");
    url_i.value = url_el.innerText;
    url_el.innerHTML = "";
    url_el.append(url_i);
    url_i.setSelectionRange(0, url_i.value.length);
    url_i.focus();
    set_chrome_size("full");
    init_search();
    url_i.oninput = () => {
        search(url_i.value);
        r_search_l();
    };
    url_i.onblur = () => {
        set_url(url_i.value);
        set_chrome_size("hide");
    };
};

function to_url(str: string) {
    if (str.match(/^:\/\//)) {
        return `https${str}`;
    }if (str.match(/^[a-z]+:\/\//i)) {
        return str;
    }if (str.match(/^[0-9a-fA-F]{40}$/)) {
        return `magnet:?xt=urn:btih:${str}`;
    }
        return `https://${str}`;
}

const download_url = "view://download";

function to_more_url(url: string) {
    if (url.match(/^magnet:?xt=urn:/)) {
        return `${download_url}?url=${encodeURIComponent(url)}`;
    }
        return url;
}

let default_engine = "";
let search_url = "";
let suggestions_url = "";

init_search();

function init_search() {
    default_engine = setting.searchEngine.default;
    search_url = setting.searchEngine.engine[default_engine].url;
    suggestions_url = setting.searchEngine.engine[default_engine].sug;
}

function to_search_url(str: string) {
    return search_url.replace("%s", encodeURIComponent(str));
}

let search_list: { url: string; text: string; icon: string }[] = [];
function search(str: string) {
    search_list = [];
    search_list.push({ url: to_more_url(to_url(str)), text: `访问 ${to_url(str)}`, icon: browser_svg });
    search_list.push({ url: to_search_url(str), text: `搜索 ${str}`, icon: search_svg });
    fetch(suggestions_url.replace("%s", encodeURIComponent(str)))
        .then((j) => j.json())
        .then((j) => {
            if (j[1]) {
                for (const s of j[1]) {
                    search_list.push({ url: to_search_url(s), text: s, icon: search_svg });
                }
            }
            r_search_l();
        });
}

function r_search_l() {
    search_list_el.innerHTML = "";
    for (const i of search_list) {
        const el = create_div();
        const icon_el = create_div();
        const text = create_div();
        el.setAttribute("data-url", i.url);
        text.innerText = i.text;
        icon_el.innerHTML = icon(i.icon);
        el.append(icon_el, text);
        el.onpointerdown = (e) => {
            ipcRenderer.send("tab_view", null, "add", i.url);
            set_chrome_size("normal");
        };
        search_list_el.append(el);
    }
}

const tree_el = document.getElementById("tree");

type tree = {
    [id: number]: {
        url: string;
        title: string;
        logo: string;
        next?: number[];
    };
};

const treeStore = new Store({ name: "tree" });
const tree = (treeStore.store || {}) as tree;

function getView(id: number) {
    const view = treeStore.get(id.toString());
    console.log(id, JSON.stringify(view));

    return view as tree[0];
}

class Card extends HTMLElement {
    view_id: number;
    _title: string;
    _next: number[];
    _image: string;
    _icon: string;
    _url: string;
    childrenEl: HTMLElement;

    constructor(id: number, title: string, next: number[], image: string) {
        super();
        this.view_id = id;
        this._title = title;
        this._next = next;
        this._image = image;
    }

    connectedCallback() {
        const bar = document.createElement("div");
        const title = document.createElement("div");
        const img = document.createElement("img");

        this.setAttribute("data-id", this.view_id.toString());

        title.innerText = this._title;

        img.src = this._image;

        img.onclick = () => {
            // 切换到活跃标签页，若已关闭，超时建立新card，不超时则重启
            if (activeViews.includes(this.view_id)) {
                ipcRenderer.send("tab_view", null, "switch", this.view_id);
                topestView = this.view_id;
            } else {
                const t = 1000 * 60 * 60 * 12;
                if (new Date().getTime() - this.view_id > t) {
                    ipcRenderer.send("tab_view", null, "add", this._url);
                } else {
                    ipcRenderer.send("tab_view", null, "restart", this.view_id);
                }
            }
            set_chrome_size("hide");
        };

        this.append(bar, title, img);

        this.childrenEl = document.createElement("div");
        this.append(this.childrenEl);
        if (this._next?.length > 0) {
            this.childrenEl.innerHTML = "";
            for (const i of this._next) {
                const child = create_card(i);
                this.childrenEl.append(child);
            }
        }
    }

    set viewId(id: number) {
        this.view_id = id;
    }
    set title(t: string) {
        this._title = t;
    }
    set next(n: number[]) {
        this._next = n;
    }
    get next() {
        return this._next;
    }
    set image(i: string) {
        this._image = i;
    }
    set icon(i: string) {
        this._icon = i;
    }
    set url(u: string) {
        this._url = u;
    }
}

customElements.define("view-card", Card);
function create_card(id: number): Card {
    const view = getView(id);
    const title = view.title;
    const next = view.next;
    const image = `file://${userDataPath}/capture/${id}.jpg`;
    const card = new Card(id, title, next, image);
    card.url = view.url;
    return card;
}

function render_tree() {
    console.log(tree);
    const root = getView(0).next.toReversed();
    // TODO 虚拟列表
    for (let i = 0; i < Math.min(5, root.length); i++) {
        const x = create_card(root[i]);
        tree_el.append(x);
    }
}

window.r = render_tree;

// 同步树状态，一般由其他窗口发出
ipcRenderer.on("view", (e, type: "add" | "close" | "update" | "move", id: number, pid: number, wid: number, op) => {
    switch (type) {
        case "add":
            cardAdd(id, pid);
            break;
        case "close":
            cardClose(id);
            break;
        case "update":
            cardUpdata(id, op);
            break;
        case "move":
            cardMove(id, wid);
            break;
        default:
            break;
    }
});

function getCardById(id: number) {
    return document.querySelector(`div[data-id="${id}"]`) as Card;
}

function cardAdd(id: number, parent: number) {
    activeViews.push(id);
    const pCardEl = getCardById(parent);
    if (pCardEl) {
        const x = create_card(id);
        pCardEl.childrenEl.insertBefore(x, pCardEl.childrenEl.firstChild);
    }
}

function cardClose(id: number) {
    activeViews = activeViews.filter((x) => x !== id);
}

function cardUpdata(id: number, op: { url?: string; title?: string; icon?: string; cover?: string }) {
    const pCardEl = getCardById(id);
    if (pCardEl) {
        if (op.title) pCardEl.title = op.title;
        if (op.icon) pCardEl.icon = op.icon;
        if (op.cover) pCardEl.image = op.cover;
        if (op.url) pCardEl.url = op.url;
    }
}

function cardMove(id: number, newParent: number) {
    if (newParent === pid) {
        myViews.push(id);
    }
}

const menu_el = document.getElementById("menu");
function menu(params: Electron.ContextMenuParams) {
    set_chrome_size("full");

    // @ts-ignore
    menu_el.showPopover();

    menu_el.innerHTML = "";

    if (params.selectionText) {
        const copy = document.createElement("div");
        copy.innerText = "复制";
        copy.onclick = () => {
            clipboard.writeText(params.selectionText.trim());
        };

        const search = document.createElement("div");
        search.innerText = `搜索“${params.selectionText.trim()}”`;
        search.onclick = () => {
            ipcRenderer.send("tab_view", null, "add", to_search_url(params.selectionText.trim()));
        };

        menu_el.append(copy, search);
    }

    if (params.linkURL) {
        const open = document.createElement("div");
        open.innerText = "打开链接";
        open.onclick = () => {
            ipcRenderer.send("tab_view", null, "add", params.linkURL);
        };

        const copy = document.createElement("div");
        copy.innerText = "复制链接";
        copy.onclick = () => {
            clipboard.writeText(params.linkURL);
        };

        menu_el.append(open, copy);
    }

    if (params.mediaType !== "none") {
        const open = document.createElement("div");
        open.innerText = "打开媒体";
        open.onclick = () => {
            ipcRenderer.send("tab_view", null, "add", params.srcURL);
        };

        const copy = document.createElement("div");
        copy.innerText = "复制链接";
        copy.onclick = () => {
            clipboard.writeText(params.srcURL);
        };

        const download = document.createElement("div");
        download.innerText = "下载媒体";
        download.onclick = () => {
            ipcRenderer.send("tab_view", null, "download", params.srcURL);
        };

        menu_el.append(open, copy, download);
    }

    const inspect = document.createElement("div");
    inspect.innerText = "检查";
    inspect.onclick = () => {
        ipcRenderer.send("tab_view", topestView, "inspect", { x: params.x, y: params.y });
    };

    menu_el.append(inspect);

    setTimeout(() => {
        menu_el.style.left = `${Math.min(params.x, window.innerWidth - menu_el.offsetWidth)}px`;
        menu_el.style.top = `${Math.min(params.y, window.innerHeight - menu_el.offsetHeight)}px`;
    }, 10);
}

menu_el.addEventListener("toggle", (e) => {
    // @ts-ignore
    if (e.newState === "closed") {
        set_chrome_size("hide");
    }
});

menu_el.onclick = hide_menu;

function hide_menu() {
    // @ts-ignore
    menu_el.hidePopover();
}

const site_about_el = document.getElementById("site_about");
const permission_el = document.getElementById("permission");

const site_p_list: Map<string, string[]> = new Map();
ipcRenderer.on("site_about", (_e, p, url) => {
    console.log(url);

    set_chrome_size("full");

    // @ts-ignore
    site_about_el.showPopover();

    const l = site_p_list.get(url) || [];
    l.push(p);
    site_p_list.set(url, l);

    render_site_permission_requ();
});

function render_site_permission_requ() {
    permission_el.innerHTML = "";
    const url = now_url;
    const l = site_p_list.get(url) || [];
    const t = document.createElement("div");
    const lel = document.createElement("div");
    t.innerText = `${new URL(url)}`;
    for (const i of l) {
        const x = document.createElement("div");
        const t = document.createElement("div");
        t.innerText = i;
        const al = document.createElement("div");
        al.innerText = "allow";
        const rj = document.createElement("div");
        rj.innerText = "rj";
        al.onclick = () => {
            ipcRenderer.send("site_about", url, i, true);
            set_chrome_size("hide");
            site_p_list.set(
                url,
                l.filter((x) => x !== i)
            );
        };
        rj.onclick = () => {
            ipcRenderer.send("site_about", url, i, false);
            set_chrome_size("hide");
            site_p_list.set(
                url,
                l.filter((x) => x !== i)
            );
        };
        x.append(t, al, rj);
        lel.append(x);
    }
    permission_el.append(t, lel);
}

site_about_el.addEventListener("toggle", (e) => {
    // @ts-ignore
    if (e.newState === "closed") {
        set_chrome_size("hide");
        if (site_p_list.get(now_url).length !== 0) {
            for (const i of site_p_list.get(now_url)) {
                ipcRenderer.send("site_about", now_url, i, false);
            }
        }
    }
});
