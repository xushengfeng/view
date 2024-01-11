const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

const { clipboard, shell } = require("electron") as typeof import("electron");

import { el } from "redom";

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

const contentEl = document.getElementById("content") as HTMLElement;

let x = new URLSearchParams(location.search);
let nowPath = "/";
if (x.get("path")) {
    nowPath = x.get("path");
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

    let l: file[] = [];

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
        } catch (error) {}
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
    contentEl.innerHTML = "";

    let s = sort(directory);
    console.log(s);

    // TODO 虚拟列表 虚拟阵列
    for (let i of s) {
        let iEl = el("div", [i.isDirectory ? el("span", "📂") : el("span", "📄"), el("span", i.name)]);
        contentEl.append(iEl);
        iEl.setAttribute("data-path", i.name);
        iEl.setAttribute("data-dir", i.isDirectory ? "1" : "0");
        if (i.isHidden) iEl.classList.add("hidden");
    }

    contentEl.onclick = (e) => {
        let eventPath = e.composedPath() as HTMLElement[];
        let targetPath = ".";
        let isDir = false;
        for (let i of eventPath) {
            if (i.getAttribute("data-path")) {
                targetPath = i.getAttribute("data-path");
                isDir = i.getAttribute("data-dir") === "1";
                break;
            }
        }
        console.log(targetPath);
        if (e.ctrlKey) {
            for (let i of shiftSelect) {
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
            }
        }
    };
}
function selectEl(l?: string[]) {
    if (!l) l = select;
    console.log(l);
    contentEl.querySelectorAll(".selected").forEach((i) => i.classList.remove("selected"));
    for (let i of l) {
        contentEl.querySelector(`[data-path="${i}"]`)?.classList.add("selected");
    }
}

// todo 拖拽
// todo 矩形框选
// todo 方向键
// todo 快捷键

function dotdot() {
    // 根据nowpath获取上一级路径
    let p = path.dirname(nowPath);
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

function copy() {
    let fileList = getFullSelect();
    console.log(fileList);
    fileList = fileList.map((i) => "file://" + path.join(nowPath, i));
    clipboard.writeText(fileList.join("\n")); // TODO 系统级api
}

var isCut = false;

function cut() {
    isCut = true;
    copy();
}

function paste() {
    let fileList = clipboard.readText().split("\n");
    fileList = fileList.map((i) => i.replace("file://", ""));
    // todo 重名检测
    if (isCut) {
        for (let i of fileList) {
            fs.renameSync(i, path.join(nowPath, i));
        }
        isCut = false;
    } else {
        for (let i of fileList) {
            fs.copyFileSync(i, path.join(nowPath, i));
        }
    }
    render(entry(nowPath));
    select = structuredClone(fileList);
    selectEl();
}

async function rename() {
    if (select.length != 1) return;
    let name = await prompt("请输入新文件名");
    // todo 重名检测
    if (!name) return;
    fs.renameSync(path.join(nowPath, select[0]), path.join(nowPath, name));
    render(entry(nowPath));
    select = [];
    selectEl();
}

async function newDir() {
    let name = await prompt("请输入文件夹名");
    // todo 重名检测
    if (!name) return;
    fs.mkdirSync(path.join(nowPath, name));
    if (select.length) {
        for (let i of select) {
            fs.renameSync(path.join(nowPath, i), path.join(nowPath, name, i));
        }
        select = [];
    }
    render(entry(nowPath));
    selectEl();
}

function zip() {
    let stream = Seven.add(path.basename(select[0]), getFullSelect(), { $progress: true });
}

function unzip() {
    // 分卷识别
    let files: string[] = [];
    let fenjuan: string[] = [];
    x: for (let i of select) {
        let p: [RegExp, string][] = [
            [/\.\d{3}$/, ".001"],
            [/\.part\d{2}\.rar$/, ".part01.rar"],
            [/\.part\d{3}\.rar$/, ".part001.rar"],
            [/\.z\d{2}/, ""],
            [/\.r\d{2}/, ""],
        ];
        for (let pp of p) {
            if (i.match(pp[0])) {
                let basename = i.replace(pp[0], "");
                if (!fenjuan.includes(basename)) {
                    fenjuan.push(basename);
                    if (pp[1]) files.push(pp[1]);
                }
                continue x;
            }
        }
        files.push(i);
    }
    // TODO 重名提醒
    for (let i of files) {
        e(i);
    }
    function e(file: string) {
        let stream0 = Seven.list(file);
        stream0.on("end", () => {
            let l = stream0.info.get(""); // TODO 具体信息
            let stream1: Seven.ZipStream;
            let targetPath = "";
            if (l === "1") {
                targetPath = nowPath;
                stream1 = Seven.extractFull(file, targetPath);
            } else {
                let dirName = path.basename(file);
                targetPath = path.join(nowPath, dirName);
                fs.mkdirSync(targetPath);
                stream1 = Seven.extractFull(file, targetPath);
            }
            let prePath = nowPath;
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
    let fileList = getFullSelect();
    for (let i of fileList) {
        shell.trashItem(i);
    }
    render(entry(nowPath));
    select = [];
    selectEl();
}

function rm() {
    let fileList = getFullSelect();
    for (let i of fileList) {
        fs.unlinkSync(i);
    }
    render(entry(nowPath));
    select = [];
    selectEl();
}

function switchHidden(h: boolean) {
    hidden = h;
    render(entry(nowPath));
    selectEl();
}

const opraEl = document.getElementById("opra");
let opra = {
    dotdot: { fun: dotdot, icon: up_svg },
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
    let opraEl = el("div");
    opraEl.className = "opra";
    opraEl.innerHTML = `<img src="${opra[type].icon}" alt="">`;
    opraEl.setAttribute("opra-type", type);
    if (opra[type].fun.length === 0) {
        opraEl.onclick = () => {
            // @ts-ignore
            opra[type].fun();
        };
    }
    if (opra[type].fun.length === 1) {
        let checkbox = el("input", { type: "checkbox" });
        let label = el("label", checkbox);
        opraEl.append(label);
        checkbox.onchange = () => {
            opra[type].fun(checkbox.checked);
        };
    }
    return opraEl;
}

let opraList: (keyof typeof opra)[] = [
    "dotdot",
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
let menuList: (keyof typeof opra)[] = ["copy", "cut", "paste", "newDir", "rename", "moveToBin", "zip", "unzip"];

opraEl.append(...opraList.map((i) => createOpraEl(i)));

(document.querySelector('[opra-type="hidden"] input') as HTMLInputElement).checked = true;

// todo ftp
// todo webdav
