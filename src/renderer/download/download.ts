const { ipcRenderer } = require("electron") as typeof import("electron");
const Store = require("electron-store") as typeof import("electron-store");

import { DownloadItem } from "../../types";

import list from "../../../lib/list";

// TODO history
let download_store = new Store({ name: "download" });

let aria2_port = NaN;

ipcRenderer.on("download", (_e, type: string, arg) => {
    switch (type) {
        case "port":
            aria2_port = arg;
            break;

        default:
            break;
    }
});

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

let x = new URLSearchParams(location.search);

if (x.get("url")) {
    ipcRenderer.send("tab_view", "download", x.get("url"));
}

function create_download_card(params: DownloadItem) {
    let el = document.createElement("div");
    let name = document.createElement("div");
    let icon = document.createElement("div");

    let buttons = document.createElement("div");
    let start = document.createElement("div");
    let pause = document.createElement("div");
    let stop = document.createElement("div");
    let restart = document.createElement("div");
    let open = document.createElement("div");
    let open_in = document.createElement("div");
    let remove = document.createElement("div");
    let info = document.createElement("div");

    let pro = document.createElement("progress");
    let speed = document.createElement("div");

    buttons.append(start, pause, stop, restart, open, open_in, remove, info);

    el.append(icon, name, buttons, pro, speed);

    el.setAttribute("data-id", String(params.id));
    return el;
}

const download_el = document.getElementById("download_item");
list(download_el, 40, 8, download_store.get("items") as any[], create_download_card);
