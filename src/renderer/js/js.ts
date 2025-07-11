/// <reference types="vite/client" />

import type { viewAction, bwin_id, cardData, treeItem, view_id } from "../../types";

const { clipboard } = require("electron") as typeof import("electron");
import * as path from "node:path";
import { addClass, button, type ElType, image, input, pureStyle, spacer, txt, view } from "dkh-ui";
import store from "../../../lib/store/renderStore";

const setting = store;

import browser_svg from "../assets/icons/browser.svg";
import search_svg from "../assets/icons/search.svg";
import { renderOn, renderSend, renderSendSync } from "../../../lib/ipc";

pureStyle();

// @auto-path:../assets/icons/$.svg
function icon(name: string) {
    return image(new URL(`../assets/icons/${name}.svg`, import.meta.url).href, "icon").class("icon");
}
// @auto-path:../assets/icons/$.svg
function iconEl(name: string) {
    return button(image(new URL(`../assets/icons/${name}.svg`, import.meta.url).href, "icon").class("icon"));
}

const pid = Number(new URLSearchParams(location.search).get("id")) as bwin_id;

let chromeSize: "normal" | "hide" | "full" = "full";
const chromeSizeFixed: "unfixed" | "fixed" | "fixedSizing" = "unfixed";

let windowMax = false;
let windowFullScreen = false;

const userDataPath = new URLSearchParams(location.search).get("userData");

let activeViews: number[] = [];
const myViews: number[] = [];
let topestView: null | view_id = null;

let treeIndex = 0;

const download_url = "view://download";

let default_engine = "";
let search_url = "";
let suggestions_url = "";

type searchListT = { url: string; text: string; icon: string }[];

const treeX = {
    get: (id: view_id) => {
        const view = renderSendSync("treeGet", [id]);
        console.log(id, JSON.stringify(view));

        return view as treeItem;
    },
    getPPP: (id: view_id) => {
        const ps: number[] = [];
        let v = treeX.get(id);
        while (v.parent !== 0) {
            const p = treeX.get(v.parent);
            ps.push(v.parent);
            v = p;
        }
        if (ps.length === 0) return [id];
        return ps;
    },
    reload: (id: view_id) => {
        sendAction({ type: "reload", viewId: id });
    },
    add: (url: string) => {
        renderSend("viewAdd", [url]);
    },
    close: (id: view_id) => {
        sendAction({ type: "close", viewId: id });
    },
    switch: (id: view_id) => {
        sendAction({ type: "focus", viewId: id });
    },
    restart: (id: view_id) => {
        sendAction({ type: "restart", viewId: id });
    },
    download: (url: string) => {
        renderSend("download", [url]);
    },
    inspect: (id: view_id, x: number, y: number) => {
        renderSend("viewInspect", [id, { x, y }]);
    },
    permission: (id: view_id, type: string, allow: boolean) => {
        renderSend("viewPermission", [id, { type, allow }]);
    },
};

const sitesPermission: Map<view_id, string[]> = new Map(); // todo url

// --- ui

const barStyle = addClass(
    {
        backgroundColor: "var(--bg)",
        backdropFilter: "var(--blur)",
    },
    {},
);

const barStyle2 = addClass(
    {
        boxShadow: "var(--shadow)",
        borderRadius: "8px",
    },
    {},
);

const inactiveStyle = addClass(
    {},
    {
        "&>:nth-child(1)": {
            opacity: 0.5,
        },
    },
);

const w_mini = iconEl("minimize").on("click", () => {
    renderSend("win", [pid, "mini"]);
    setChromeSize("hide");
});
const w_max = iconEl("maximize").on("click", () => {
    renderSend("win", [pid, "max"]);
    setChromeSize("hide");
});
const w_close = iconEl("close").on("click", () => {
    renderSend("win", [pid, "close"]);
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
    if (topestView) treeX.reload(topestView);
    setChromeSize("hide");
});

const show_tree = iconEl("reload").on("click", () => {
    setChromeSize("full");
    renderTree(treeIndex);
});

buttons.add([b_reload, show_tree]);

const barEl = view().add([buttons, urlEl, system_el]).addInto().attr({ id: "bar" });

const searchListEl = view()
    .style({
        position: "absolute",
        zIndex: 1,
        maxHeight: "320px",
        overflowY: "auto",
        left: "48px",
        top: "24px",
        width: "calc(100vw - 48px * 2)",
    })
    .class(barStyle, barStyle2)
    .addInto();
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

const treePel = view("y").class(barStyle).style({ height: "calc(100vh - 24px)", width: "100vw" }).addInto();

const treeEl = view("x").style({ width: "100vw", overflowX: "scroll", flexGrow: 1 }).addInto(treePel);

class Card extends HTMLElement {
    view_id: view_id;
    _title = view().bindSet((v: string, el) => {
        el.innerText = v ?? "无标题";
    });
    _next: view_id[];
    _image: string;
    _icon = "";
    _url = "";
    childrenEl: ElType<HTMLElement> = view();
    _active = false;
    closeEl = iconEl("close").on("click", () => {
        treeX.close(this.view_id);
        this.active(false);
    });

    constructor(id: view_id, title: string, next: view_id[] | undefined, image: string) {
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

        img.on("click", (e) => {
            // 切换到活跃标签页
            if (activeViews.includes(this.view_id)) {
                treeX.switch(this.view_id);
                topestView = this.view_id;
            } else {
                if (e.ctrlKey) {
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
                const child = createCard(i);
                this.childrenEl.add(child);
            }
        }
    }

    set viewId(id: view_id) {
        this.view_id = id;
    }
    set next(n: view_id[]) {
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
        if (topestView) {
            const list = sitesPermission.get(topestView);
            for (const i of list ?? []) {
                treeX.permission(topestView, i, false);
            }
        }
    }
});

// --- fun

function setChromeSize(type: "normal" | "hide" | "full") {
    // todo menu等禁止hide

    let t = type;
    if (type === "hide" && (chromeSizeFixed !== "unfixed" || (!windowMax && !windowFullScreen))) t = "normal";
    renderSend("win", [pid, `${t}_chrome`]);

    if (type === "normal") {
        searchListEl.clear();
    }
    if (t !== "full") {
        treePel.style({ display: "none" });
    }
    if (t === "hide") {
        // @ts-ignore
        barEl.style({ "-webkit-app-region": "no-drag" });
    } else {
        // @ts-ignore
        barEl.style({ "-webkit-app-region": "drag" });
    }
    chromeSize = type;
}

function setUrl(url: string) {
    urlEl.sv(url);

    urlEl.clear();
    const protocol = url.split(":")[0];
    const x = url.split(":").slice(1).join(":");
    if (protocol && x) {
        urlEl.add(protocol.slice(0, 1)); // todo icon
        let detail: URL;
        if (protocol === "file") {
            detail = new URL(url);
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
        const domainEl = txt().style({ color: "#444", whiteSpace: "nowrap" }).addInto(urlEl);
        if (domain.split(".")?.length > 2) {
            domainEl.add(
                domain
                    .split(".")
                    .slice(0, -2)
                    .flatMap((x) => [decodeURIComponent(x), h(".")]),
            );
            domainEl.add(
                txt()
                    .add(
                        domain
                            .split(".")
                            .slice(-2)
                            .flatMap((x) => [decodeURIComponent(x), h(".")])
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
            urlEl.add(v("@", decodeURIComponent(detail.username)));
        }

        if (detail.password) {
            const hideP = "********";
            const pEl = txt(hideP);
            urlEl.add(
                txt()
                    .add([h(":"), pEl])
                    .style({ color: "#444" })
                    .on("pointerenter", () => {
                        pEl.sv(decodeURIComponent(detail.password));
                    })
                    .on("pointerleave", () => {
                        pEl.sv(hideP);
                    }),
            );
        }

        if (detail.pathname) {
            // todo windows?
            const p = decodeURIComponent(detail.pathname)
                .split("/")
                .filter((x) => x !== "");
            const l = p.flatMap((x) => [txt(x).style({ color: "#444" }), h("/")]).slice(0, -1);
            if (process.platform !== "win32") {
                l.unshift(h("/"));
            }
            l.at(-1)?.style({ color: "#000" });
            urlEl.add(view().style({ whiteSpace: "nowrap" }).add(l));
        }

        if (detail.hash) {
            const hash = detail.hash.slice(1);
            urlEl.add(v("#", decodeURIComponent(hash)));
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

    if (u)
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
    const el = view("x").data({ url: i.url });
    const icon_el = view().add(image(i.icon, "icon").class("icon"));
    const text = view().add(i.text);
    el.add([icon_el, text]);
    el.on("pointerdown", (_e) => {
        treeX.add(i.url);
        setChromeSize("normal");
    });
    searchListEl.add(el);
}

function createCard(id: view_id): Card {
    const view = treeX.get(id);
    const title = view.title;
    const next = view.next;
    const image = `file://${userDataPath}/capture/${id}.jpg`;
    const card = new Card(id, title, next, image);
    card.url = view.url;
    return card;
}

function renderTree(i: number) {
    treeIndex = i;
    treePel.style({ display: "flex" });
    treeEl.clear();
    const d = 5;
    const root = (treeX.get(0 as view_id).next ?? []).toReversed();
    const rootSlice = root.slice(i * d, i * d + d);
    treeEl.add(spacer()); // justify-content:end
    if (i * d + d <= root.length) {
        treeEl.add(
            iconEl("left")
                .style({ flexShrink: 0 })
                .on("click", () => {
                    renderTree(i + 1);
                }),
        );
    }
    const treeContent = view("x").style({ flexDirection: "row-reverse" }).addInto(treeEl);
    for (const i of rootSlice) {
        const x = createCard(i);
        treeContent.add(
            view().add(x).style({ maxHeight: "100%", overflowY: "scroll", overflowX: "hidden", padding: "4px" }),
        );
    }
    if (i > 0) {
        treeEl.add(
            iconEl("right")
                .style({ flexShrink: 0 })
                .on("click", () => {
                    renderTree(i - 1);
                }),
        );
    }

    treeEl.el.scrollLeft = treeEl.el.scrollWidth - treeEl.el.offsetWidth;
}

function showTree(b: boolean) {
    if (b) {
        setChromeSize("full");
        renderTree(treeIndex);
    } else {
        setChromeSize("hide");
    }
}

function getCardById(id: number) {
    return document.querySelector(`[data-id="${id}"]`) as Card;
}

function sendAction(a: { type: "close" | "reload" | "stop" | "restart" | "focus"; viewId: view_id }) {
    const action: viewAction = {
        type: a.type,
        viewId: a.viewId,
        ignoreBid: pid,
        actionId: Date.now(),
    };
    // ui
    receiveAction(action); // 来自同一页面的操作，立即执行，不通过主进程反射中转
    // ui+操作
    renderSend("viewAction", [action]);
}

function receiveAction(action: viewAction) {
    switch (action.type) {
        case "close":
            cardClose(action.viewId);
            break;
        case "restart":
            cardRestart(action.viewId);
            break;
        case "update":
            cardUpdata(action.viewId, action.data);
            break;
    }
}

function cardAdd(id: view_id, parent: number) {
    activeViews.push(id);
    topestView = id;
    myViews.push(id);
    if (chromeSize !== "full") setChromeSize("normal");
    const pCardEl = getCardById(parent);
    if (pCardEl) {
        const x = createCard(id);
        pCardEl.childrenEl.el.insertBefore(x, pCardEl.childrenEl.el.firstChild);
    }
}

function cardRestart(id: view_id) {
    activeViews.push(id);
    topestView = id;
    myViews.push(id);
    if (chromeSize !== "full") setChromeSize("normal");
    const cardEl = getCardById(id);
    cardEl.active(true);
}

function cardClose(id: view_id) {
    activeViews = activeViews.filter((x) => x !== id);
    const cardEl = getCardById(id);
    cardEl.active(false);
}

function cardUpdata(id: view_id, op: cardData) {
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
            if (topestView) treeX.inspect(topestView, params.x, params.y);
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

function render_site_permission_requ(id: view_id) {
    permissionEl.clear();
    const url = treeX.get(id).url;
    const l = sitesPermission.get(id) || [];
    const t = view();
    const lel = view().add(`${new URL(url)}`);
    for (const i of l) {
        const x = view();
        const t = view().add(i);
        const al = view()
            .add("allow")
            .on("click", () => {
                treeX.permission(id, i, true);
                setChromeSize("hide");
                sitesPermission.set(
                    id,
                    l.filter((x) => x !== i),
                );
            });
        const rj = view()
            .add("reject")
            .on("click", () => {
                treeX.permission(id, i, false);
                setChromeSize("hide");
                sitesPermission.set(
                    id,
                    l.filter((x) => x !== i),
                );
            });
        x.add([t, al, rj]);
        lel.add(x);
    }
    permissionEl.add([t, lel]);
}

renderOn("chromeState", ([t]) => {
    if (t === "max") {
        w_max.clear().add(icon("unmaximize"));
        windowMax = true;
        setChromeSize(chromeSize);
    }
    if (t === "unmax") {
        w_max.clear().add(icon("maximize"));
        windowMax = false;
        setChromeSize(chromeSize);
    }
});

renderOn("showMenu", ([arg]) => {
    console.log(arg);
    menu(arg);
});
renderOn("zoom", ([l]) => {
    console.log(l);
});
renderOn("chorme", () => {
    if (chromeSize === "hide") {
        setChromeSize("normal");
    } else if (chromeSize === "normal") {
        setChromeSize("hide");
    }
});
renderOn("toggleTree", () => {
    showTree(treePel.el.style.display === "none");
});
renderOn("fullScreen", ([p]) => {
    if (p) {
        windowFullScreen = true;
        setChromeSize(chromeSize);
    } else {
        windowFullScreen = false;
        setChromeSize(chromeSize);
    }
});

init_search();

// 同步树状态

renderOn("viewAction", ([action]) => {
    console.log("receive action", action);
    receiveAction(action);
});

renderOn("viewSAdd", ([id, pid]) => cardAdd(id, pid));
renderOn("viewSMove", ([id, win]) => cardMove(id, win));

renderOn("siteAbout", ([p, url, id]) => {
    console.log("permission", url, id, p);

    setChromeSize("full");

    siteAboutEl.el.showPopover();

    const l = sitesPermission.get(id) || [];
    l.push(p);
    sitesPermission.set(id, l);

    render_site_permission_requ(id);
    // todo switch时切换
});

renderTree(0);
