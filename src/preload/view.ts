import { contextBridge, ipcRenderer } from "electron";
import type { setting } from "../types";
import { renderSend } from "../../lib/ipc";

contextBridge.exposeInMainWorld("electron", {});

window.onload = () => {
    console.log("hi");
    init_status_bar();
    get_opensearch();
    inputx();
};

const status_bar = document.createElement("div");

function init_status_bar() {
    if (window.top !== window) return;
    const el = status_bar;
    el.style.position = "fixed";
    el.style.left = "0";
    el.style.bottom = "0";
    el.style.fontSize = "12px";
    el.style.whiteSpace = "nowrap";
    el.style.backdropFilter = "blur(10px)";
    el.style.backgroundColor = "#fff9";
    el.style.borderTopRightRadius = "4px";
    el.style.overflow = "hidden";
    el.style.textOverflow = "ellipsis";
    el.style.transition = "0.4s";
    el.style.pointerEvents = "none";
    el.style.zIndex = "99999999";

    document.body.append(el);
}

let status_bar_t1: NodeJS.Timeout;

function get_opensearch() {
    const l: setting["searchEngine"]["engine"] = {};
    for (const el of document.querySelectorAll('link[type="application/opensearchdescription+xml"')) {
        const href = el.getAttribute("href");
        if (href) {
            fetch(href)
                .then((x) => x.text())
                .then((text) => {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(text, "application/xml");
                    const name = doc.querySelector("ShortName")?.textContent;
                    if (!name) return;
                    l[name] = {
                        des: doc.querySelector("Description")?.textContent,
                        img: doc.querySelector("Image")?.textContent,
                        url: "",
                        sug: "",
                        from: "opensearch",
                    } as setting["searchEngine"]["engine"][""];
                    for (const el of doc.querySelectorAll("Url")) {
                        const type = el.getAttribute("type");
                        if (type === "text/html") {
                            l[name].url = el.getAttribute("template")?.replaceAll("{searchTerms}", "%s") || "";
                        }
                        if (type === "application/x-suggestions+json" || type === "application/json") {
                            l[name].sug = el.getAttribute("template")?.replaceAll("{searchTerms}", "%s") || "";
                        }
                    }
                    renderSend("addOpensearch", [l]);
                });
        }
    }
}

ipcRenderer.on("view_event", (_e, type, arg) => {
    switch (type) {
        case "target_url":
            if (window.top !== window) return;
            status_bar.style.maxWidth = "50vw";
            if (status_bar_t1) clearTimeout(status_bar_t1);
            status_bar_t1 = setTimeout(() => {
                status_bar.style.maxWidth = "90vw";
            }, 1000);
            if (arg === "") {
                status_bar.style.opacity = "0";
            } else {
                status_bar.style.opacity = "1";
                status_bar.innerText = decodeURIComponent(arg);
            }
            break;
    }
});

const prect = { x: 0, y: 0 };
window.addEventListener("message", (m) => {
    if (m.data.x && m.data.y) {
        prect.x = m.data.X;
        prect.y = m.data.y;
    }
});

function inputx() {
    for (const el of document.querySelectorAll("iframe")) {
        el.contentWindow?.postMessage(el.getBoundingClientRect(), "*");
    }
    const forml: HTMLInputElement[] = [];
    // 密码
    for (const fel of document.querySelectorAll("form")) {
        const l = { username: "", passwd: "" };
        for (const iel of fel.querySelectorAll("input")) {
            iel.addEventListener("blur", () => {
                if (["email", "tel", "text", ""].includes(iel.type.toLowerCase()) && iel.value) {
                    l.username = iel.value;
                } else if (iel.type.toLowerCase() === "password") {
                    l.passwd = iel.value;
                }
                renderSend("input", [{ action: "blur", ...l }]);
            });
            iel.addEventListener("focus", () => {
                const r = iel.getBoundingClientRect();
                r.x += prect.x;
                r.y += prect.y;
                renderSend("input", [
                    {
                        action: "focus",
                        position: r.toJSON(),
                        type: iel.type,
                        value: iel.value,
                    },
                ]);
            });
            forml.push(iel);
        }
    }
    console.log(forml);

    // 自动填充和list
    for (const iel of document.querySelectorAll("input")) {
        if (!forml.includes(iel)) {
            console.log(iel);

            iel.addEventListener("focus", () => {
                const r = iel.getBoundingClientRect();
                r.x += prect.x;
                r.y += prect.y;
                if (iel.list) {
                    const list: string[] = [];
                    for (const op of iel.list.querySelectorAll("option")) {
                        list.push(op.textContent ?? "");
                    }
                    renderSend("input", [
                        {
                            action: "focus",
                            position: r.toJSON(),
                            type: "list",
                            list,
                        },
                    ]);
                } else if (iel.value === "") {
                    if (iel.autocomplete !== "off" && true) {
                        // TODO 默认补全与否
                        renderSend("input", [
                            {
                                action: "focus",
                                position: r.toJSON(),
                                autocomplete: iel.autocomplete,
                            },
                        ]);
                    }
                }
            });
            iel.addEventListener("blur", () => {
                renderSend("input", [
                    {
                        action: "blur",
                    },
                ]);
            });
        }
    }
}
