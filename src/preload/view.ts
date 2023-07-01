import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {});

window.onload = () => {
    console.log("hi");
};
