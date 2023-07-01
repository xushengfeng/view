import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {});

window.onload = () => {
    console.log("hi");
    init_status_bar();
};

let status_bar = document.createElement("div");

function init_status_bar() {
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

ipcRenderer.on("view_event", (_e, type, arg) => {
    switch (type) {
        case "target_url":
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
