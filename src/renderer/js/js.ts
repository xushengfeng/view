/// <reference types="vite/client" />

const { ipcRenderer, clipboard } = require("electron") as typeof import("electron");
import { addClass, button, ele, type ElType, image, input, pureStyle, txt, view } from "dkh-ui";
import store from "../../../lib/store/renderStore";

const setting = store;

import browser_svg from "../assets/icons/browser.svg";
import search_svg from "../assets/icons/search.svg";

pureStyle();

// @auto-path:../assets/icons/$.svg
function icon(name: string) {
    return image(new URL(`../assets/icons/${name}.svg`, import.meta.url).href, "icon").class("icon");
}
// @auto-path:../assets/icons/$.svg
function iconEl(name: string) {
    return button(image(new URL(`../assets/icons/${name}.svg`, import.meta.url).href, "icon").class("icon"));
}

/** browserwindow id */
let pid = Number.NaN;

let chrome_size: "normal" | "hide" | "full" = "normal";
const chrome_size_fixed = false;

/** 用户目录 */
let userDataPath = "";

let now_url = "about:blank";

let activeViews = [];
const myViews = [];
let topestView = Number.NaN;

const download_url = "view://download";

let default_engine = "";
let search_url = "";
let suggestions_url = "";

let search_list: { url: string; text: string; icon: string }[] = [];

const treeX = {
    get: (id: number) => {
        const view = ipcRenderer.sendSync("tab_view", null, "get", id);
        console.log(id, JSON.stringify(view));

        return view as tree[0];
    },
    reload: (id: number) => {
        ipcRenderer.send("tab_view", id, "reload");
    },
    add: (url: string) => {
        ipcRenderer.send("tab_view", null, "add", url);
    },
    switch: (id: number) => {
        ipcRenderer.send("tab_view", null, "switch", id);
    },
    restart: (id: number) => {
        ipcRenderer.send("tab_view", null, "restart", id);
    },
    download: (url: string) => {
        ipcRenderer.send("tab_view", null, "download", url);
    },
    inspect: (id: number, x: number, y: number) => {
        ipcRenderer.send("tab_view", id, "inspect", { x, y });
    },
};

type tree = {
    [id: number]: {
        url: string;
        title: string;
        logo: string;
        next?: number[];
    };
};

const site_p_list: Map<string, string[]> = new Map();

// --- ui

const barStyle = addClass(
    {
        backgroundColor: "var(--bg)",
        backdropFilter: "var(--blur)",
    },
    {},
);

const w_mini = iconEl("minimize").on("click", () => {
    ipcRenderer.send("win", pid, "mini");
    set_chrome_size("hide");
});
const w_max = iconEl("maximize").on("click", () => {
    ipcRenderer.send("win", pid, "max");
    set_chrome_size("hide");
});
const w_close = iconEl("close").on("click", () => {
    ipcRenderer.send("win", pid, "close");
});

const system_el = view().attr({ id: "system" });

system_el.add([w_mini, w_max, w_close]);

const buttons = view().attr({ id: "buttons" });
const url_el = ele("span").attr({ id: "url" });

const b_reload = iconEl("reload").on("click", () => {
    treeX.reload(topestView);
    set_chrome_size("hide");
});

const show_tree = iconEl("reload").on("click", () => {
    set_chrome_size("full");
    render_tree();
});

buttons.add([b_reload, show_tree]);

view()
    .add([buttons, view().attr({ id: "url_bar" }).add(url_el), system_el])
    .addInto()
    .attr({ id: "bar" });

const search_list_el = view().attr({ id: "search_list" }).addInto();
url_el.on("pointerdown", (e) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    e.preventDefault();
    const url_i = input().sv(url_el.el.innerText);
    url_el.clear().add(url_i);
    url_i.el.setSelectionRange(0, url_i.gv.length);
    url_i.el.focus();
    set_chrome_size("full");
    init_search();
    url_i
        .on("input", () => {
            search(url_i.gv);
            r_search_l();
        })
        .on("blur", () => {
            set_url(url_i.gv);
            set_chrome_size("hide");
        });
});

const treeEl = view("x")
    .class(barStyle)
    .style({ height: "calc(100vh - 24px)", width: "100vw", overflow: "scroll" })
    .addInto();

class Card extends HTMLElement {
    view_id: number;
    _title: string;
    _next: number[];
    _image: string;
    _icon: string;
    _url: string;
    childrenEl: ElType<HTMLElement>;

    constructor(id: number, title: string, next: number[], image: string) {
        super();
        this.view_id = id;
        this._title = title;
        this._next = next;
        this._image = image;
    }

    connectedCallback() {
        const bar = view();
        const title = view();
        const img = image(this._image, "preview")
            .style({ maxWidth: "260px", maxHeight: "260px" })
            .on("error", () => {
                img.remove();
            });

        this.setAttribute("data-id", this.view_id.toString());

        title.add(this._title ?? "无标题");

        img.on("click", () => {
            // 切换到活跃标签页，若已关闭，超时建立新card，不超时则重启
            if (activeViews.includes(this.view_id)) {
                treeX.switch(this.view_id);
                topestView = this.view_id;
            } else {
                const t = 1000 * 60 * 60 * 12;
                if (new Date().getTime() - this.view_id > t) {
                    treeX.add(this._url);
                } else {
                    treeX.restart(this.view_id);
                }
            }
            set_chrome_size("hide");
        });

        this.append(
            view().add([bar, title, img]).style({ padding: "8px", borderRadius: "8px", boxShadow: "var(--shadow)" }).el,
        );

        this.childrenEl = view();
        this.append(this.childrenEl.el);
        if (this._next?.length > 0) {
            this.childrenEl.clear();
            for (const i of this._next) {
                const child = create_card(i);
                this.childrenEl.add(child);
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

const menu_el = view().attr({ id: "menu", popover: "auto" }).addInto();

menu_el.el.addEventListener("toggle", (e) => {
    // @ts-ignore
    if (e.newState === "closed") {
        set_chrome_size("hide");
    }
});

menu_el.on("click", hide_menu);

const siteAboutEl = view().attr({ popover: "auto", id: "site_about" }).addInto();
const permissionEl = view().addInto(siteAboutEl).attr({ id: "permission" });

siteAboutEl.el.addEventListener("toggle", (e) => {
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

// --- fun

function set_chrome_size(type: "normal" | "hide" | "full") {
    if (type === "hide" && chrome_size_fixed) {
        chrome_size = "normal";
    } else {
        chrome_size = type;
    }
    ipcRenderer.send("win", pid, `${chrome_size}_chrome`);
    if (chrome_size === "normal") {
        search_list_el.clear();
    }
}

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
        const m = txt();
        m.sv(h);
        url_el.clear().add([l0, m, l1]);
    } catch (error) {
        const m = txt();
        m.sv(url);
        url_el.clear().add(m);
    }
}

function to_url(str: string) {
    if (str.match(/^:\/\//)) {
        return `https${str}`;
    }
    if (str.match(/^[a-z]+:\/\//i)) {
        return str;
    }
    if (str.match(/^[0-9a-fA-F]{40}$/)) {
        return `magnet:?xt=urn:btih:${str}`;
    }
    return `https://${str}`;
}

function to_more_url(url: string) {
    if (url.match(/^magnet:?xt=urn:/)) {
        return `${download_url}?url=${encodeURIComponent(url)}`;
    }
    return url;
}

function init_search() {
    default_engine = setting.get("searchEngine.default");
    const e = setting.get("searchEngine.engine");
    search_url = e[default_engine].url;
    suggestions_url = e[default_engine].sug;
}

function to_search_url(str: string) {
    return search_url.replace("%s", encodeURIComponent(str));
}

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
    search_list_el.clear();
    for (const i of search_list) {
        const el = view().data({ url: i.url });
        const icon_el = view().add(image(i.icon, "icon").class("icon"));
        const text = view().add(i.text);
        el.add([icon_el, text]);
        el.on("pointerdown", (_e) => {
            treeX.add(i.url);
            set_chrome_size("normal");
        });
        search_list_el.add(el);
    }
}

function create_card(id: number): Card {
    const view = treeX.get(id);
    const title = view.title;
    const next = view.next;
    const image = `file://${userDataPath}/capture/${id}.jpg`;
    const card = new Card(id, title, next, image);
    card.url = view.url;
    return card;
}

function render_tree() {
    treeEl.clear();
    const root = treeX.get(0).next.toReversed();
    // TODO 虚拟列表
    for (let i = 0; i < Math.min(5, root.length); i++) {
        const x = create_card(root[i]);
        treeEl.add(x);
    }
}

function getCardById(id: number) {
    return document.querySelector(`div[data-id="${id}"]`) as Card;
}

function cardAdd(id: number, parent: number) {
    activeViews.push(id);
    const pCardEl = getCardById(parent);
    if (pCardEl) {
        const x = create_card(id);
        pCardEl.childrenEl.el.insertBefore(x, pCardEl.childrenEl.el.firstChild);
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

function menu(params: Electron.ContextMenuParams) {
    set_chrome_size("full");

    menu_el.el.showPopover();

    menu_el.clear();

    if (params.selectionText) {
        const copy = view()
            .add("复制")
            .on("click", () => {
                clipboard.writeText(params.selectionText.trim());
            });

        const search = view()
            .add(`搜索“${params.selectionText.trim()}”`)
            .on("click", () => {
                treeX.add(to_search_url(params.selectionText.trim()));
            });

        menu_el.add([copy, search]);
    }

    if (params.linkURL) {
        const open = view()
            .add("打开链接")
            .on("click", () => {
                treeX.add(params.linkURL);
            });

        const copy = view()
            .add("复制链接")
            .on("click", () => {
                clipboard.writeText(params.linkURL);
            });

        menu_el.add([open, copy]);
    }

    if (params.mediaType !== "none") {
        const open = view()
            .add("打开媒体")
            .on("click", () => {
                treeX.add(params.srcURL);
            });

        const copy = view()
            .add("复制链接")
            .on("click", () => {
                clipboard.writeText(params.srcURL);
            });

        const download = view()
            .add("下载媒体")
            .on("click", () => {
                treeX.download(params.srcURL);
            });

        menu_el.add([open, copy, download]);
    }

    const inspect = view()
        .add("检查")
        .on("click", () => {
            treeX.inspect(topestView, params.x, params.y);
        });

    menu_el.add(inspect);

    setTimeout(() => {
        menu_el.style({
            left: `${Math.min(params.x, window.innerWidth - menu_el.el.offsetWidth)}px`,
            top: `${Math.min(params.y, window.innerHeight - menu_el.el.offsetHeight)}px`,
        });
    }, 10);
}

function hide_menu() {
    menu_el.el.hidePopover();
}

function render_site_permission_requ() {
    permissionEl.clear();
    const url = now_url;
    const l = site_p_list.get(url) || [];
    const t = view();
    const lel = view().add(`${new URL(url)}`);
    for (const i of l) {
        const x = view();
        const t = view().add(i);
        const al = view()
            .add("allow")
            .on("click", () => {
                ipcRenderer.send("site_about", url, i, true);
                set_chrome_size("hide");
                site_p_list.set(
                    url,
                    l.filter((x) => x !== i),
                );
            });
        const rj = view()
            .add("reject")
            .on("click", () => {
                ipcRenderer.send("site_about", url, i, false);
                set_chrome_size("hide");
                site_p_list.set(
                    url,
                    l.filter((x) => x !== i),
                );
            });
        x.add([t, al, rj]);
        lel.add(x);
    }
    permissionEl.add([t, lel]);
}

ipcRenderer.on("win", (_e, a, arg) => {
    switch (a) {
        case "max":
            w_max.clear().add(icon("unmaximize"));
            break;
        case "unmax":
            w_max.clear().add(icon("maximize"));
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

ipcRenderer.on("url", (_e, view, type, arg) => {
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

init_search();

// 同步树状态，一般由其他窗口发出
ipcRenderer.on("view", (_e, type: "add" | "close" | "update" | "move", id: number, pid: number, wid: number, op) => {
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

ipcRenderer.on("site_about", (_e, p, url) => {
    console.log(url);

    set_chrome_size("full");

    siteAboutEl.el.showPopover();

    const l = site_p_list.get(url) || [];
    l.push(p);
    site_p_list.set(url, l);

    render_site_permission_requ();
});
