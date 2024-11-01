const fs = require("node:fs") as typeof import("fs");
const path = require("node:path") as typeof import("path");

const { clipboard, shell } = require("electron") as typeof import("electron");

import { check, label, txt, view } from "dkh-ui";

const isWindow = process.platform === "win32";
let winattr: typeof import("winattr");
if (isWindow) {
    winattr = require("winattr");
}

let hidden = true;

import Seven from "node-7z";

import copy_svg from "../assets/icons/copy.svg";
import paste_svg from "../assets/icons/paste.svg";
import cut_svg from "../assets/icons/cut.svg";
import delete_svg from "../assets/icons/clear.svg";
import rename_svg from "../assets/icons/rename.svg";
import zip_svg from "../assets/icons/zip.svg";
import unzip_svg from "../assets/icons/unzip.svg";
import folder_svg from "../assets/icons/file.svg";
import up_svg from "../assets/icons/up.svg";
import eye_svg from "../assets/icons/eye.svg";
import reload_svg from "../assets/icons/reload.svg";

const opraEl = view().attr({ id: "opra" }).addInto();
const contentEl = view().attr({ id: "content" }).addInto();

const x = new URLSearchParams(location.search);
let nowPath = "/";
if (x.get("path")) {
    nowPath = x.get("path") as string;
    render(entry(nowPath));
}
type file = {
    name: string;
    isDirectory: boolean;
    size: number;
    isSymbolicLink: boolean;
    atime: Date;
    mtime: Date;
    birthtime: Date;
    isHidden: boolean;
};
function entry(directory: string) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    const l: file[] = [];

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        let stat: import("fs").Stats;
        let lstat: import("fs").Stats;
        let isHidden = false;
        if (isWindow) {
            winattr.get(fullPath, (error, data) => {
                isHidden = error != null ? false : data.hidden;
            });
        } else {
            isHidden = entry.name.startsWith(".");
        }
        try {
            stat = fs.statSync(fullPath);
            lstat = fs.lstatSync(fullPath);
            if (!hidden || !isHidden)
                l.push({
                    name: entry.name,
                    isDirectory: entry.isDirectory(),
                    atime: stat?.atime,
                    birthtime: stat?.birthtime,
                    mtime: stat?.mtime,
                    isSymbolicLink: lstat?.isSymbolicLink(), // lstat
                    size: stat?.size,
                    isHidden,
                });
        } catch (error) {}
    }
    return l;
}

function sort(l: file[]) {
    return l.toSorted((a, b) => {
        return a.name.localeCompare(b.name, navigator.language, { numeric: true });
    });
}

let select: string[] = [];
let shiftSelect: string[] = [];

function render(directory: file[]) {
    contentEl.clear();

    const s = sort(directory);
    console.log(s);

    // TODO 虚拟列表 虚拟阵列
    for (const i of s) {
        const iEl = view()
            .add([i.isDirectory ? txt("📂") : txt("📄"), txt(i.name)])
            .addInto(contentEl)
            .data({
                path: i.name,
                dir: i.isDirectory ? "1" : "0",
            });
        if (i.isHidden) iEl.class("hidden");
    }

    contentEl.el.onclick = (e) => {
        const eventPath = e.composedPath() as HTMLElement[];
        let targetPath = ".";
        let isDir = false;
        for (const i of eventPath) {
            if (i.getAttribute("data-path")) {
                targetPath = i.getAttribute("data-path") as string;
                isDir = i.getAttribute("data-dir") === "1";
                break;
            }
        }
        console.log(targetPath);
        if (e.ctrlKey) {
            for (const i of shiftSelect) {
                if (!select.includes(i)) {
                    select.push(i);
                }
            }
            shiftSelect = [];
            if (select.includes(targetPath)) {
                select = select.filter((i) => i !== targetPath);
            } else {
                select.push(targetPath);
            }
            selectEl(select);
        } else if (e.shiftKey) {
            let start = s.findIndex((i) => i.name === targetPath);
            let end = s.findIndex((i) => i.name === select.at(-1));
            if (start > end) {
                [start, end] = [end, start];
            }
            shiftSelect = s.slice(start, end + 1).map((i) => i.name);
            selectEl(select.concat(shiftSelect));
        } else {
            if (isDir) {
                nowPath = path.join(nowPath, targetPath);
                render(entry(nowPath));
            } else {
                // todo 打开文件 自定义
                console.log(targetPath);
                window.open(`file://${path.join(nowPath, targetPath)}`);
            }
        }
    };
}
function selectEl(l: string[] = select) {
    console.log(l);
    for (const i of contentEl.queryAll(".selected")) {
        i.el.classList.remove("selected");
    }
    for (const i of l) {
        contentEl.query(`[data-path="${i}"]`)?.class("selected");
    }
}

// todo 拖拽
// todo 矩形框选
// todo 方向键
// todo 快捷键

function dotdot() {
    // 根据nowpath获取上一级路径
    const p = path.dirname(nowPath);
    if (p === nowPath) {
        return;
    }
    nowPath = p;
    render(entry(nowPath));
    select = [];
    selectEl();
}

function getFullSelect() {
    return select.map((i) => path.join(nowPath, i));
}

async function prompt(text: string) {
    return "";
}

function reflash() {
    render(entry(nowPath));
    selectEl();
}

function copy() {
    let fileList = getFullSelect();
    console.log(fileList);
    fileList = fileList.map((i) => `file://${path.join(nowPath, i)}`);
    clipboard.writeText(fileList.join("\n")); // TODO 系统级api
}

let isCut = false;

function cut() {
    isCut = true;
    copy();
}

function paste() {
    let fileList = clipboard.readText().split("\n");
    fileList = fileList.map((i) => i.replace("file://", ""));
    // todo 重名检测
    if (isCut) {
        for (const i of fileList) {
            fs.renameSync(i, path.join(nowPath, i));
        }
        isCut = false;
    } else {
        for (const i of fileList) {
            fs.copyFileSync(i, path.join(nowPath, i));
        }
    }
    render(entry(nowPath));
    select = structuredClone(fileList);
    selectEl();
}

async function rename() {
    if (select.length !== 1) return;
    const name = await prompt("请输入新文件名");
    // todo 重名检测
    if (!name) return;
    fs.renameSync(path.join(nowPath, select[0]), path.join(nowPath, name));
    render(entry(nowPath));
    select = [];
    selectEl();
}

async function newDir() {
    const name = await prompt("请输入文件夹名");
    // todo 重名检测
    if (!name) return;
    fs.mkdirSync(path.join(nowPath, name));
    if (select.length) {
        for (const i of select) {
            fs.renameSync(path.join(nowPath, i), path.join(nowPath, name, i));
        }
        select = [];
    }
    render(entry(nowPath));
    selectEl();
}

function zip() {
    const stream = Seven.add(path.basename(select[0]), getFullSelect(), { $progress: true });
}

function unzip() {
    // 分卷识别
    const files: string[] = [];
    const fenjuan: string[] = [];
    lx: for (const i of select) {
        const p: [RegExp, string][] = [
            [/\.\d{3}$/, ".001"],
            [/\.part\d{2}\.rar$/, ".part01.rar"],
            [/\.part\d{3}\.rar$/, ".part001.rar"],
            [/\.z\d{2}/, ""],
            [/\.r\d{2}/, ""],
        ];
        for (const pp of p) {
            if (i.match(pp[0])) {
                const basename = i.replace(pp[0], "");
                if (!fenjuan.includes(basename)) {
                    fenjuan.push(basename);
                    if (pp[1]) files.push(pp[1]);
                }
                continue lx;
            }
        }
        files.push(i);
    }
    // TODO 重名提醒
    for (const i of files) {
        e(i);
    }
    function e(file: string) {
        const stream0 = Seven.list(file);
        stream0.on("end", () => {
            const l = stream0.info.get(""); // TODO 具体信息
            let stream1: Seven.ZipStream;
            let targetPath = "";
            if (l === "1") {
                targetPath = nowPath;
                stream1 = Seven.extractFull(file, targetPath);
            } else {
                const dirName = path.basename(file);
                targetPath = path.join(nowPath, dirName);
                fs.mkdirSync(targetPath);
                stream1 = Seven.extractFull(file, targetPath);
            }
            const prePath = nowPath;
            stream1.on("end", () => {
                if (nowPath === prePath) {
                    render(entry(nowPath));
                    select = [path.basename(targetPath)];
                    selectEl();
                }
            });
        });
    }
}

function moveToBin() {
    const fileList = getFullSelect();
    for (const i of fileList) {
        shell.trashItem(i);
    }
    render(entry(nowPath));
    select = [];
    selectEl();
}

function rm() {
    const fileList = getFullSelect();
    for (const i of fileList) {
        fs.unlinkSync(i);
    }
    render(entry(nowPath));
    select = [];
    selectEl();
}

function switchHidden(h: boolean) {
    hidden = !h;
    render(entry(nowPath));
    selectEl();
}

const opra = {
    dotdot: { fun: dotdot, icon: up_svg },
    reflash: { fun: reflash, icon: reload_svg },
    copy: { fun: copy, icon: copy_svg },
    cut: { fun: cut, icon: cut_svg },
    paste: { fun: paste, icon: paste_svg },
    newDir: { fun: newDir, icon: folder_svg },
    rename: { fun: rename, icon: rename_svg },
    moveToBin: { fun: moveToBin, icon: delete_svg },
    delete: { fun: rm, icon: delete_svg },
    zip: { fun: zip, icon: zip_svg },
    unzip: { fun: unzip, icon: unzip_svg },
    hidden: { fun: switchHidden, icon: eye_svg },
};

function createOpraEl(type: keyof typeof opra) {
    const opraEl = view().class("opra");
    opraEl.el.innerHTML = `<img src="${opra[type].icon}" alt="">`;
    if (opra[type].fun.length === 0) {
        opraEl.el.onclick = () => {
            // @ts-ignore
            opra[type].fun();
        };
    }
    if (opra[type].fun.length === 1) {
        const checkbox = check("");
        opraEl.add(label([checkbox]));
        checkbox.el.onchange = () => {
            opra[type].fun(checkbox.gv);
        };
    }
    return opraEl;
}

const opraList: (keyof typeof opra)[] = [
    "dotdot",
    "reflash",
    "copy",
    "cut",
    "paste",
    "newDir",
    "rename",
    "moveToBin",
    "zip",
    "unzip",
    "delete",
    "hidden",
];
const menuList: (keyof typeof opra)[] = ["copy", "cut", "paste", "newDir", "rename", "moveToBin", "zip", "unzip"];

opraEl.add(opraList.map((i) => createOpraEl(i)));

// todo ftp
// todo webdav
