const { ipcRenderer } = require("electron") as typeof import("electron");

import mini_svg from "../assets/icons/minimize.svg";
import max_svg from "../assets/icons/maximize.svg";
import unmax_svg from "../assets/icons/unmaximize.svg";
import close_svg from "../assets/icons/close.svg";
import back_svg from "../assets/icons/left.svg";
import forward_svg from "../assets/icons/right.svg";
import reload_svg from "../assets/icons/reload.svg";

function icon(src: string) {
    return `<img src="${src}" class="icon">`;
}

/** browserwindow id */
let pid = NaN;

let w_mini = document.createElement("div");
let w_max = document.createElement("div");
let w_close = document.createElement("div");

let system_el = document.getElementById("system_right");

w_mini.innerHTML = icon(mini_svg);
w_max.innerHTML = icon(max_svg);
w_close.innerHTML = icon(close_svg);
w_mini.onclick = () => {
    ipcRenderer.send("win", "mini");
};
w_max.onclick = () => {
    ipcRenderer.send("win", "max");
};
w_close.onclick = () => {
    ipcRenderer.send("win", "close");
};

system_el.append(w_mini, w_max, w_close);

ipcRenderer.on("win", (e, a, arg) => {
    switch (a) {
        case "max":
            w_max.innerHTML = icon(unmax_svg);
            break;
        case "unmax":
            w_max.innerHTML = icon(max_svg);
            break;
        case "id":
            pid = arg;
            break;
    }
});

let buttons = document.getElementById("buttoms");
let url_el = document.getElementById("url");

let b_back = document.createElement("div");
b_back.innerHTML = icon(back_svg);
b_back.onclick = () => {
    ipcRenderer.send("tab_view", "back");
};

let b_forward = document.createElement("div");
b_forward.innerHTML = icon(forward_svg);
b_forward.onclick = () => {
    ipcRenderer.send("tab_view", "forward");
};

let b_reload = document.createElement("div");
b_reload.innerHTML = icon(reload_svg);
b_reload.onclick = () => {
    ipcRenderer.send("tab_view", "reload");
};

buttons.append(b_back, b_forward, b_reload);

function set_url(url: string) {
    let x = new URL(url);
    let l = url.split(x.hostname);
    let hostl = x.hostname.split(".");
    let h = "";
    if (hostl.length == 3) {
        l[0] += hostl[0];
        h = `${hostl[1]}.${hostl[2]}`;
    } else {
        h = x.hostname;
    }
    let m = document.createElement("span");
    m.innerText = h;
    url_el.innerHTML = "";
    url_el.append(l[0], m, l[1]);
}

let wins = [];
let now_win = NaN;

ipcRenderer.on("url", (e, view, type, arg) => {
    switch (type) {
        case "new":
            now_win = view;
            wins.push(view);
            break;
        case "url":
            if (view == now_win) {
                set_url(arg);
            }
            break;
    }
});

ipcRenderer.send("tab_view", null, "add", "https://www.bing.com");
