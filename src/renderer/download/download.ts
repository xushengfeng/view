const { ipcRenderer } = require("electron") as typeof import("electron");
const Store = require("electron-store") as typeof import("electron-store");

// TODO history
let download_store = new Store({ name: "download" });

// TODO
