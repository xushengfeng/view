import { contextBridge, ipcRenderer } from "electron";
import { setting } from "../types";

contextBridge.exposeInMainWorld("electron", {});

window.onload = () => {
    console.log("hi");
    init_status_bar();
    get_opensearch();
    inputx();
};

let status_bar = document.createElement("div");

function init_status_bar() {
    if (window.top != window) return;
    let el = status_bar;
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
    let l = {};
    document.querySelectorAll('link[type="application/opensearchdescription+xml"').forEach((el) => {
        let href = el.getAttribute("href");
        if (href) {
            fetch(href)
                .then((x) => x.text())
                .then((text) => {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(text, "application/xml");
                    let name = doc.querySelector("ShortName").textContent;
                    l[name] = {
                        des: doc.querySelector("Description").textContent,
                        img: doc.querySelector("Image").textContent,
                        url: "",
                        sug: "",
                        from: "opensearch",
                    } as setting["searchEngine"]["engine"][""];
                    doc.querySelectorAll("Url").forEach((el) => {
                        let type = el.getAttribute("type");
                        if (type == "text/html") {
                            l[name].url = el.getAttribute("template").replaceAll("{searchTerms}", "%s");
                        }
                        if (type == "application/x-suggestions+json" || type == "application/json") {
                            l[name].sug = el.getAttribute("template").replaceAll("{searchTerms}", "%s");
                        }
                    });
                    ipcRenderer.send("view", "opensearch", l);
                });
        }
    });
}

ipcRenderer.on("view_event", (_e, type, arg) => {
    switch (type) {
        case "target_url":
            if (window.top != window) return;
            status_bar.style.maxWidth = "50vw";
            if (status_bar_t1) clearTimeout(status_bar_t1);
            status_bar_t1 = setTimeout(() => {
                status_bar.style.maxWidth = "90vw";
            }, 1000);
            if (arg == "") {
                status_bar.style.opacity = "0";
            } else {
                status_bar.style.opacity = "1";
                status_bar.innerText = decodeURIComponent(arg);
            }
            break;
    }
});

let prect = { x: 0, y: 0 };
window.addEventListener("message", (m) => {
    if (m.data.x && m.data.y) {
        prect.x = m.data.X;
        prect.y = m.data.y;
    }
});

function inputx() {
    document.querySelectorAll("iframe").forEach((el) => {
        el.contentWindow.postMessage(el.getBoundingClientRect(), "*");
    });
    let forml = [];
    // 密码
    document.querySelectorAll("from").forEach((fel) => {
        let l = { username: "", passwd: "" };
        fel.querySelectorAll("input").forEach((iel) => {
            iel.addEventListener("blur", () => {
                if (["email", "tel", "text", ""].includes(iel.type.toLowerCase()) && iel.value) {
                    l.username = iel.value;
                } else if (iel.type.toLowerCase() == "password") {
                    l.passwd = iel.value;
                }
                ipcRenderer.send("view", "input", { action: "blur", ...l });
            });
            iel.addEventListener("focus", () => {
                let r = iel.getBoundingClientRect();
                r.x += prect.x;
                r.y += prect.y;
                ipcRenderer.send("view", "input", {
                    action: "focus",
                    position: r.toJSON(),
                    type: iel.type,
                    value: iel.value,
                });
            });
            forml.push(iel);
        });
    });
    console.log(forml);

    // 自动填充和list
    document.querySelectorAll("input").forEach((iel) => {
        if (!forml.includes(iel)) {
            console.log(iel);

            iel.addEventListener("focus", () => {
                let r = iel.getBoundingClientRect();
                r.x += prect.x;
                r.y += prect.y;
                if (iel.list) {
                    let list = [];
                    iel.list.querySelectorAll("option").forEach((op) => {
                        list.push(op.value);
                    });
                    ipcRenderer.send("view", "input", {
                        action: "focus",
                        position: r.toJSON(),
                        type: "list",
                        list,
                    });
                } else if (iel.value == "") {
                    if (iel.autocomplete != "off" && true) {
                        // TODO 默认补全与否
                        ipcRenderer.send("view", "input", {
                            action: "focus",
                            position: r.toJSON(),
                            autocomplete: iel.autocomplete,
                        });
                    }
                }
            });
            iel.addEventListener("blur", () => {
                ipcRenderer.send("view", "input", { action: "blur" });
            });
        }
    });
}
