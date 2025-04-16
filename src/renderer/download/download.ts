const { ipcRenderer } = require("electron") as typeof import("electron");
const Store = require("electron-store") as typeof import("electron-store");

import type { DownloadItem } from "../../types";

import list from "../../../lib/list";
import { renderSend } from "../../../lib/ipc";

// TODO history
const download_store = new Store({ name: "download" });

let aria2_port = Number.NaN;

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

const x = new URLSearchParams(location.search);

if (x.get("url")) {
    renderSend("download", [x.get("url") ?? ""]);
}

function create_download_card(params: DownloadItem) {
    const el = document.createElement("div");
    const name = document.createElement("div");
    const icon = document.createElement("div");

    const buttons = document.createElement("div");
    const start = document.createElement("div");
    const pause = document.createElement("div");
    const stop = document.createElement("div");
    const restart = document.createElement("div");
    const open = document.createElement("div");
    const open_in = document.createElement("div");
    const remove = document.createElement("div");
    const info = document.createElement("div");

    const pro = document.createElement("progress");
    const speed = document.createElement("div");

    buttons.append(start, pause, stop, restart, open, open_in, remove, info);

    el.append(icon, name, buttons, pro, speed);

    el.setAttribute("data-id", String(params.id));
    return el;
}

const download_el = document.getElementById("download_item");
list(download_el, 40, 8, download_store.get("items") as any[], create_download_card);
