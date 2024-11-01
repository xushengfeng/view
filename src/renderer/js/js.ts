/// <reference types="vite/client" />

import type { cardData, syncView } from "../../types";

const { ipcRenderer, clipboard } = require("electron") as typeof import("electron");
import * as path from "node:path";
import { addClass, button, ele, type ElType, image, input, pureStyle, txt, view } from "dkh-ui";
import store from "../../../lib/store/renderStore";

const setting = store;

import browser_svg from "../assets/icons/browser.svg";
import search_svg from "../assets/icons/search.svg";
import { add } from "node-7z";

pureStyle();

// @auto-path:../assets/icons/$.svg
function icon(name: string) {
    return image(new URL(`../assets/icons/${name}.svg`, import.meta.url).href, "icon").class("icon");
}
// @auto-path:../assets/icons/$.svg
function iconEl(name: string) {
    return button(image(new URL(`../assets/icons/${name}.svg`, import.meta.url).href, "icon").class("icon"));
}

const pid = Number(new URLSearchParams(location.search).get("id"));

let chrome_size: "normal" | "hide" | "full" = "full";
const chrome_size_fixed = false;

const userDataPath = new URLSearchParams(location.search).get("userData");

let now_url = "about:blank";

let activeViews: number[] = [];
const myViews: number[] = [];
let topestView = Number.NaN;

const download_url = "view://download";

let default_engine = "";
let search_url = "";
let suggestions_url = "";

type searchListT = { url: string; text: string; icon: string }[];

const treeX = {
    get: (id: number) => {
        const view = ipcRenderer.sendSync("tab_view", "get", id);
        console.log(id, JSON.stringify(view));

        return view as tree[0];
    },
    reload: (id: number) => {
        ipcRenderer.send("tab_view", "reload", id);
    },
    add: (url: string) => {
        ipcRenderer.send("tab_view", "add", null, url);
    },
    close: (id: number) => {
        ipcRenderer.send("tab_view", "close", id);
    },
    switch: (id: number) => {
        ipcRenderer.send("tab_view", "switch", id);
    },
    restart: (id: number) => {
        ipcRenderer.send("tab_view", "restart", id);
    },
    download: (url: string) => {
        ipcRenderer.send("tab_view", "download", null, url);
    },
    inspect: (id: number, x: number, y: number) => {
        ipcRenderer.send("tab_view", "inspect", id, { x, y });
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

const inactiveStyle = addClass(
    {},
    {
        ":nth-child(1)": {
            opacity: 0.5,
        },
    },
);

const w_mini = iconEl("minimize").on("click", () => {
    ipcRenderer.send("win", pid, "mini");
    setChromeSize("hide");
});
const w_max = iconEl("maximize").on("click", () => {
    ipcRenderer.send("win", pid, "max");
    setChromeSize("hide");
});
const w_close = iconEl("close").on("click", () => {
    ipcRenderer.send("win", pid, "close");
});

const system_el = view().attr({ id: "system" });

system_el.add([w_mini, w_max, w_close]);

const buttons = view().attr({ id: "buttons" });
const urlEl = view("x")
    .style({
        width: "400px",
        gap: "8px",
        minHeight: "1rem",
        overflowX: "scroll",
        // @ts-ignore
        "-webkit-app-region": "no-drag",
    })
    .class(addClass({}, { "&::-webkit-scrollbar": { display: "none" } }))
    .bindSet((url: string, el) => {
        el.setAttribute("data-url", url);
    })
    .bindGet((el) => {
        return el.getAttribute("data-url") ?? "";
    });

const b_reload = iconEl("reload").on("click", () => {
    treeX.reload(topestView);
    setChromeSize("hide");
});

const show_tree = iconEl("reload").on("click", () => {
    setChromeSize("full");
    renderTree();
});

buttons.add([b_reload, show_tree]);

view().add([buttons, urlEl, system_el]).addInto().attr({ id: "bar" });

const searchListEl = view().attr({ id: "search_list" }).addInto();
urlEl.on("contextmenu", (e) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    e.preventDefault();
    const url_i = input().sv(urlEl.gv).style({ width: "100%" });
    urlEl.clear().add(url_i);
    url_i.el.setSelectionRange(0, url_i.gv.length);
    url_i.el.focus();
    setChromeSize("full");
    init_search();
    url_i
        .on("input", () => {
            search(url_i.gv);
        })
        .on("blur", () => {
            setUrl(url_i.gv);
            if (activeViews.length > 0) {
                setChromeSize("hide");
            }
        });
});

const treePel = view("y")
    .class(barStyle)
    .style({ height: "calc(100vh - 24px)", width: "100vw", overflow: "scroll" })
    .addInto();

const treeEl = view("x").style({ width: "100vw", overflow: "scroll", flexGrow: 1 }).addInto(treePel);

class Card extends HTMLElement {
    view_id: number;
    _title = view().bindSet((v: string, el) => {
        el.innerText = v ?? "无标题";
    });
    _next: number[];
    _image: string;
    _icon = "";
    _url = "";
    childrenEl: ElType<HTMLElement> = view();
    _active = false;
    closeEl = iconEl("close").on("click", () => {
        treeX.close(this.view_id);
        this.active(false);
    });

    constructor(id: number, title: string, next: number[] | undefined, image: string) {
        super();
        this.view_id = id;
        this._title.sv(title);
        this._next = next ?? [];
        this._image = image;
        this._active = activeViews.includes(this.view_id);
    }

    connectedCallback() {
        const bar = view().add([this.closeEl]);

        this.active(this._active);

        const img = image(this._image, "preview")
            .style({ maxWidth: "260px", maxHeight: "260px" })
            .on("error", () => {
                img.remove();
            });

        this.setAttribute("data-id", this.view_id.toString());

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
            setChromeSize("hide");
        });

        this.append(
            view()
                .add([bar, this._title, img])
                .style({ padding: "8px", borderRadius: "8px", boxShadow: "var(--shadow)" }).el,
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
    active(a: boolean) {
        this._active = a;
        if (a) {
            this.classList.remove(inactiveStyle);
            this.closeEl.style({ display: "block" });
        } else {
            this.classList.add(inactiveStyle);
            this.closeEl.style({ display: "none" });
        }
    }
}

customElements.define("view-card", Card);

const menu_el = view().attr({ id: "menu" }).addInto();
menu_el.el.popover = "auto";

menu_el.el.addEventListener("toggle", (e) => {
    // @ts-ignore
    if (e.newState === "closed") {
        setChromeSize("hide");
    }
});

menu_el.on("click", hide_menu);

const siteAboutEl = view().attr({ id: "site_about" }).addInto();
siteAboutEl.el.popover = "auto";
const permissionEl = view().addInto(siteAboutEl).attr({ id: "permission" });

siteAboutEl.el.addEventListener("toggle", (e) => {
    // @ts-ignore
    if (e.newState === "closed") {
        setChromeSize("hide");
        const list = site_p_list.get(now_url);
        for (const i of list ?? []) {
            ipcRenderer.send("site_about", now_url, i, false);
        }
    }
});

// --- fun

function setChromeSize(type: "normal" | "hide" | "full") {
    // todo menu等禁止hide

    let t = type;
    if (type === "hide" && chrome_size_fixed) t = "normal";
    ipcRenderer.send("win", pid, `${t}_chrome`);

    if (type === "normal") {
        searchListEl.clear();
    }
    if (type === "hide") {
        treeEl.style({ display: "none" });
    }
    chrome_size = type;
}

function setUrl(url: string) {
    now_url = url;
    urlEl.sv(url);

    urlEl.clear();
    const protocol = url.split(":")[0];
    const x = url.split(":").slice(1).join(":");
    if (protocol && x) {
        urlEl.add(protocol.slice(0, 1)); // todo icon
        let detail: URL;
        if (protocol === "file") {
            detail = new URL(x);
        } else {
            const fakeUrl = `https://${x.replace(/^\/\//, "")}`;
            detail = new URL(fakeUrl);
        }

        console.log(detail);

        const hClass = addClass({ fontSize: "0.8em", color: "#444" }, {});
        const h = (x: string) => txt(x).class(hClass);

        const v = (_h: string, v: string) => {
            const x = view().add(h(_h)).style({ color: "#444", display: "inline-block" });
            const value = txt(v);
            const edit = input()
                .sv(value.gv)
                .style({ display: "none" })
                .on("change", () => {
                    value.sv(edit.gv);
                    edit.style({ display: "none" });
                    value.style({ display: "inline-block" });
                });
            x.add(
                value.on("click", () => {
                    edit.sv(value.gv);
                    edit.style({ display: "inline-block" });
                    value.style({ display: "none" });
                }),
            );
            return x;
        };

        const domain = detail.hostname;
        const domainEl = txt().style({ color: "#444" }).addInto(urlEl);
        if (domain.split(".")?.length > 2) {
            domainEl.add(
                domain
                    .split(".")
                    .slice(0, -2)
                    .flatMap((x) => [x, h(".")]),
            );
            domainEl.add(
                txt()
                    .add(
                        domain
                            .split(".")
                            .slice(-2)
                            .flatMap((x) => [x, h(".")])
                            .slice(0, -1),
                    )
                    .style({ color: "#000" }),
            );
        } else {
            domainEl.add(txt(domain).style({ color: "#000" }));
        }

        if (detail.port) {
            urlEl.add(v(":", detail.port));
        }

        if (detail.username) {
            urlEl.add(v("@", detail.username));
        }

        if (detail.password) {
            const hideP = "********";
            const pEl = txt(hideP);
            urlEl.add(
                txt()
                    .add([h(":"), pEl])
                    .style({ color: "#444" })
                    .on("pointerenter", () => {
                        pEl.sv(detail.password);
                    })
                    .on("pointerleave", () => {
                        pEl.sv(hideP);
                    }),
            );
        }

        if (detail.pathname) {
            // todo windows?
            const p = detail.pathname.split("/").filter((x) => x !== "");
            const l = p.flatMap((x) => [txt(x).style({ color: "#444" }), h("/")]);
            l.at(-1)?.style({ color: "#000" });
            urlEl.add(view().add(l));
        }

        if (detail.hash) {
            const hash = detail.hash.slice(1);
            urlEl.add(v("#", hash));
        }

        if (detail.search) {
            urlEl.add(
                view().add([
                    h("?").on("click", () => {
                        // todo 弹窗列表修改
                    }),
                ]),
            );
        }
    } else {
        urlEl.add(url);
    }
}

function isUrlLike(str: string) {
    if (str.match(/^:\/\//)) {
        return ":";
    }
    if (str.match(/^[a-z]+:\/\//i)) {
        return "p";
    }
    if (str.match(/^[0-9a-fA-F]{40}$/)) {
        return "magnet";
    }
    if (process.platform === "win32" && str.match(/^[a-zA-Z]:/)) {
        return "file";
    }
    if (str.startsWith("/")) {
        return "file";
    }
    if (str.match(/.*\.[a-zA-Z]/)) {
        return true;
    }
    if (
        str.split(".").length === 4 &&
        str
            .split(".")
            .map((i) => Number(i))
            .every((i) => i >= 0 && i <= 255)
    ) {
        return "ip";
    }
    return false;
}

function toUrl(str: string) {
    if (str.match(/^:\/\//)) {
        return `https${str}`;
    }
    if (str.match(/^[a-z]+:\/\//i)) {
        if (str.startsWith("file://") && process.platform === "win32") {
            return str.replace(/\\/g, "/"); // todo 更好的处理？
        }
        return str;
    }
    if (str.match(/^[0-9a-fA-F]{40}$/)) {
        return `magnet:?xt=urn:btih:${str}`;
    }
    if (process.platform === "win32" && str.match(/^[a-zA-Z]:/)) {
        const p = str.replace(/\\/g, "/");
        return `file://${path.normalize(p)}`;
    }
    if (str.startsWith("/")) {
        return `file://${path.normalize(str)}`;
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
    searchListEl.clear();

    const u = str.trim();
    if (isUrlLike(u)) addSearchItem({ url: to_more_url(toUrl(u)), text: `访问 ${toUrl(u)}`, icon: browser_svg });
    addSearchItem({ url: to_search_url(str), text: `搜索 ${str}`, icon: search_svg });

    // todo enter
    // todo 上下方向键导航

    fetch(suggestions_url.replace("%s", encodeURIComponent(str)))
        .then((j) => j.json())
        .then((j) => {
            if (j[1]) {
                for (const s of j[1]) {
                    addSearchItem({ url: to_search_url(s), text: s, icon: search_svg });
                }
            }
        });
}

function addSearchItem(i: searchListT[0]) {
    const el = view().data({ url: i.url });
    const icon_el = view().add(image(i.icon, "icon").class("icon"));
    const text = view().add(i.text);
    el.add([icon_el, text]);
    el.on("pointerdown", (_e) => {
        treeX.add(i.url);
        setChromeSize("normal");
    });
    searchListEl.add(el);
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

function renderTree() {
    treeEl.clear();
    treeEl.style({ display: "flex" });
    const i = 0;
    // @ts-ignore
    const root = (treeX.get(0).next ?? []).toReversed().slice(i, i + 5);
    // TODO 虚拟列表
    for (const i of root.toReversed()) {
        const x = create_card(i);
        treeEl.add(x);
    }
}

function getCardById(id: number) {
    return document.querySelector(`[data-id="${id}"]`) as Card;
}

function cardAdd(id: number, parent: number) {
    activeViews.push(id);
    topestView = id;
    myViews.push(id);
    if (chrome_size !== "full") setChromeSize("normal");
    const pCardEl = getCardById(parent);
    if (pCardEl) {
        const x = create_card(id);
        pCardEl.childrenEl.el.insertBefore(x, pCardEl.childrenEl.el.firstChild);
    }
}

function cardRestart(id: number) {
    activeViews.push(id);
    topestView = id;
    myViews.push(id);
    if (chrome_size !== "full") setChromeSize("normal");
    const cardEl = getCardById(id);
    cardEl.active(true);
}

function cardClose(id: number) {
    activeViews = activeViews.filter((x) => x !== id);
    const cardEl = getCardById(id);
    cardEl.active(false);
}

function cardUpdata(id: number, op: cardData) {
    const cardEl = getCardById(id);
    if (cardEl) {
        if (op.title) cardEl._title.sv(op.title);
        if (op.icon) cardEl.icon = op.icon;
        if (op.cover) cardEl.image = op.cover;
        if (op.url) {
            cardEl.url = op.url;
            if (id === topestView) {
                setUrl(op.url);
            }
        }
    }
    if (op.loading === false) {
        setChromeSize("hide");
    }
}

function cardMove(id: number, newParent: number) {
    if (newParent === pid) {
        myViews.push(id);
    }
}

function menu(params: Electron.ContextMenuParams) {
    setChromeSize("full");

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
                setChromeSize("hide");
                site_p_list.set(
                    url,
                    l.filter((x) => x !== i),
                );
            });
        const rj = view()
            .add("reject")
            .on("click", () => {
                ipcRenderer.send("site_about", url, i, false);
                setChromeSize("hide");
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
                setChromeSize("normal");
            } else if (chrome_size === "normal") {
                setChromeSize("hide");
            }
            break;
    }
});

init_search();

// 同步树状态
ipcRenderer.on("view", (_e, type: syncView, id: number, pid: number, wid: number, op) => {
    console.log(type, id, pid, wid, op);
    switch (type) {
        case "add":
            cardAdd(id, pid);
            break;
        case "restart":
            cardRestart(id);
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

    setChromeSize("full");

    siteAboutEl.el.showPopover();

    const l = site_p_list.get(url) || [];
    l.push(p);
    site_p_list.set(url, l);

    render_site_permission_requ();
});

renderTree();
