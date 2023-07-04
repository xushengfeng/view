const { ipcRenderer } = require("electron") as typeof import("electron");
const Store = require("electron-store") as typeof import("electron-store");

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
