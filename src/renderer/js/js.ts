const { ipcRenderer } = require("electron") as typeof import("electron");

import back_svg from "../assets/icons/left.svg";
import forward_svg from "../assets/icons/right.svg";
import reload_svg from "../assets/icons/reload.svg";

function icon(src: string) {
    return `<img src="${src}" class="icon">`;
}
let buttons = document.getElementById("buttoms");

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
