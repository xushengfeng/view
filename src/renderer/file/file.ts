import { getImgUrl } from "../root/root";

const fs = require("node:fs") as typeof import("fs");
const path = require("node:path") as typeof import("path");

const { clipboard, shell } = require("electron") as typeof import("electron");

import { check, ele, type ElType, image, input, label, pureStyle, txt, view } from "dkh-ui";

import type Fuse from "fuse.js";
import fuse from "fuse.js";

const isWindow = process.platform === "win32";
let winattr: typeof import("winattr");
if (isWindow) {
    winattr = require("winattr");
}

import Seven from "node-7z";

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

const fileViews: FileView[] = [];

let nowFileIndex = 0;

let isCut = false;

let willShowMenu = false;

const opraEl = view().attr({ id: "opra" }).addInto();
const menuEl = view().style({ position: "fixed", margin: 0 }).addInto();
menuEl.el.popover = "auto";
const contentEl = view().attr({ id: "content" }).addInto();

pureStyle();

document.body.addEventListener("pointerup", (e) => {
    if (willShowMenu) {
        menuEl.el.showPopover();
        willShowMenu = false;
    }
});

async function prompt(text: string) {
    return "";
}

function showMenu(x: number, y: number) {
    menuEl
        .clear()
        .style({ left: `${x}px`, top: `${y}px` })
        .on("click", () => {
            menuEl.el.hidePopover();
        });
    willShowMenu = true;
}

class FileView {
    renderEl: ElType<HTMLElement>;
    nowPath = "/";

    opraEl: ElType<HTMLElement>;
    menuEl: ElType<HTMLElement> = view();

    select: string[] = [];
    shiftSelect: string[] = [];

    isHidden = true;

    opra = {
        dotdot: { fun: () => this.dotdot(), icon: getImgUrl("up.svg") },
        reflash: { fun: () => this.reflash(), icon: getImgUrl("reload.svg") },
        copy: { fun: () => this.copy(), icon: getImgUrl("copy.svg") },
        cut: { fun: () => this.cut(), icon: getImgUrl("cut.svg") },
        paste: { fun: () => this.paste(), icon: getImgUrl("paste.svg") },
        newDir: { fun: () => this.newDir(), icon: getImgUrl("file.svg") },
        rename: { fun: () => this.rename(), icon: getImgUrl("rename.svg") },
        moveToBin: { fun: () => this.moveToBin(), icon: getImgUrl("clear.svg") },
        delete: { fun: () => this.rm(), icon: getImgUrl("clear.svg") },
        zip: { fun: () => this.zip(), icon: getImgUrl("zip.svg") },
        unzip: { fun: () => this.unzip(), icon: getImgUrl("unzip.svg") },
        hidden: { fun: (v: boolean) => this.hidden(v), v: () => !this.isHidden, icon: getImgUrl("eye.svg") },
    };

    menuList: (keyof typeof this.opra)[] = ["copy", "cut", "paste", "newDir", "rename", "moveToBin", "zip", "unzip"];

    search: Fuse<file> = new fuse([]);

    constructor(el: ElType<HTMLElement>, opraEl: ElType<HTMLElement>) {
        this.renderEl = el;
        this.opraEl = opraEl;
    }
    #entry(directory: string) {
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

    #sort(l: file[]) {
        return l.toSorted((a, b) => {
            return a.name.localeCompare(b.name, navigator.language, { numeric: true });
        });
    }

    #render(directory: file[]) {
        contentEl.clear();

        const s = this.isHidden ? this.#sort(directory.filter((i) => !i.isHidden)) : this.#sort(directory);
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

        const getTargetUrl = (e: PointerEvent | MouseEvent) => {
            const eventPath = (e.composedPath() as HTMLElement[]).filter(
                (i) => "getAttribute" in i && i.getAttribute("data-path"),
            );
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
            return { targetPath, isDir };
        };

        contentEl.el.onclick = (e) => {
            const { targetPath, isDir } = getTargetUrl(e);
            console.log(targetPath);
            if (targetPath === ".") {
                this.select = [];
                this.#selectEl();
                return;
            }
            if (e.ctrlKey) {
                for (const i of this.shiftSelect) {
                    if (!this.select.includes(i)) {
                        this.select.push(i);
                    }
                }
                this.shiftSelect = [];
                if (this.select.includes(targetPath)) {
                    this.select = this.select.filter((i) => i !== targetPath);
                } else {
                    this.select.push(targetPath);
                }
                this.#selectEl(this.select);
            } else if (e.shiftKey) {
                let start = s.findIndex((i) => i.name === targetPath);
                let end = s.findIndex((i) => i.name === this.select.at(-1));
                if (start > end) {
                    [start, end] = [end, start];
                }
                this.shiftSelect = s.slice(start, end + 1).map((i) => i.name);
                this.#selectEl(this.select.concat(this.shiftSelect));
            } else {
                if (isDir) {
                    this.setPath(path.join(this.nowPath, targetPath));
                } else {
                    // todo 打开文件 自定义
                    console.log(targetPath);
                    window.open(`file://${path.join(this.nowPath, targetPath)}`);
                }
            }
        };
        contentEl.el.oncontextmenu = (e) => {
            e.preventDefault();
            showMenu(e.clientX, e.clientY);
            const targetPath = getTargetUrl(e).targetPath;
            if (!this.select.includes(targetPath)) {
                this.select = [targetPath];
                this.#selectEl(this.select);
            }
            for (const i of this.menuList) {
                const fun = this.opra[i].fun;
                menuEl.add(
                    view("x")
                        .add([image(this.opra[i].icon, `${i} icon`).style({ width: "24px" }), i])
                        .on("click", () => {
                            // @ts-ignore
                            fun();
                        }),
                );
            }
        };
    }
    #selectEl(l: string[] = this.select) {
        console.log(l);
        for (const i of contentEl.queryAll(".selected")) {
            i.el.classList.remove("selected");
        }
        for (const i of l) {
            contentEl.query(`[data-path="${i}"]`)?.class("selected");
        }
    }

    setPath(p: string) {
        this.nowPath = p;
        const l = this.#entry(p);
        this.#render(l);
        this.search = new fuse(l, { keys: ["name"] });

        document.title = path.basename(p);
    }

    // todo 拖拽
    // todo 矩形框选
    // todo 方向键
    // todo 快捷键

    dotdot() {
        // 根据nowpath获取上一级路径
        const p = path.dirname(this.nowPath);
        if (p === this.nowPath) {
            return;
        }
        this.setPath(p);
        this.select = [];
        this.#selectEl();
    }

    getFullSelect() {
        return this.select.map((i) => path.join(this.nowPath, i));
    }

    reflash() {
        this.setPath(this.nowPath);
        this.#selectEl();
    }

    copy() {
        let fileList = this.getFullSelect();
        console.log(fileList);
        fileList = fileList.map((i) => `file://${i}`);
        clipboard.writeText(fileList.join("\n")); // TODO 系统级api
    }

    cut() {
        isCut = true;
        this.copy();
    }

    paste() {
        let fileList = clipboard.readText().split("\n");
        fileList = fileList.map((i) => i.replace(/^file:\/\//, ""));
        // todo 重名检测
        if (isCut) {
            for (const i of fileList) {
                fs.renameSync(i, path.join(this.nowPath, path.basename(i)));
            }
            isCut = false;
        } else {
            for (const i of fileList) {
                fs.copyFileSync(i, path.join(this.nowPath, path.basename(i)));
            }
        }
        this.setPath(this.nowPath);
        this.select = structuredClone(fileList);
        this.#selectEl();
    }

    async rename() {
        if (this.select.length !== 1) return;
        const name = await prompt("请输入新文件名");
        // todo 重名检测
        if (!name) return;
        fs.renameSync(path.join(this.nowPath, this.select[0]), path.join(this.nowPath, name));
        this.setPath(this.nowPath);
        this.select = [];
        this.#selectEl();
    }

    async newDir() {
        const name = await prompt("请输入文件夹名");
        // todo 重名检测
        if (!name) return;
        fs.mkdirSync(path.join(this.nowPath, name));
        if (this.select.length) {
            for (const i of this.select) {
                fs.renameSync(path.join(this.nowPath, i), path.join(this.nowPath, name, i));
            }
            this.select = [];
        }
        this.setPath(this.nowPath);
        this.#selectEl();
    }

    zip() {
        const stream = Seven.add(path.basename(this.select[0]), this.getFullSelect(), { $progress: true });
    }

    unzip() {
        // 分卷识别
        const files: string[] = [];
        const fenjuan: string[] = [];
        lx: for (const i of this.select) {
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
        const e = (file: string) => {
            const stream0 = Seven.list(file);
            stream0.on("end", () => {
                const l = stream0.info.get(""); // TODO 具体信息
                let stream1: Seven.ZipStream;
                let targetPath = "";
                if (l === "1") {
                    targetPath = this.nowPath;
                    stream1 = Seven.extractFull(file, targetPath);
                } else {
                    const dirName = path.basename(file);
                    targetPath = path.join(this.nowPath, dirName);
                    fs.mkdirSync(targetPath);
                    stream1 = Seven.extractFull(file, targetPath);
                }
                const prePath = this.nowPath;
                stream1.on("end", () => {
                    if (this.nowPath === prePath) {
                        this.setPath(this.nowPath);
                        this.select = [path.basename(targetPath)];
                        this.#selectEl();
                    }
                });
            });
        };
        for (const i of files) {
            e(i);
        }
    }

    moveToBin() {
        const fileList = this.getFullSelect();
        for (const i of fileList) {
            shell.trashItem(i);
        }
        this.setPath(this.nowPath);
        this.select = [];
        this.#selectEl();
    }

    rm() {
        const fileList = this.getFullSelect();
        for (const i of fileList) {
            fs.unlinkSync(i);
        }
        this.setPath(this.nowPath);
        this.select = [];
        this.#selectEl();
    }

    hidden(h: boolean) {
        this.isHidden = !h;
        this.setPath(this.nowPath);
        this.#selectEl();
    }

    filter(f: string) {
        const l = this.search.search(f);
        this.#render(l.map((i) => i.item));
    }

    #showOpra() {
        const opraList: (keyof typeof this.opra)[] = [
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

        const createOpraEl = (type: keyof typeof this.opra) => {
            const opraEl = view().class("opra");
            opraEl.el.innerHTML = `<img src="${this.opra[type].icon}" alt="">`;

            const o = this.opra[type];

            if ("v" in o) {
                const checkbox = check("").sv(o.v());
                opraEl.add(label([checkbox]));
                checkbox.el.onchange = () => {
                    o.fun(checkbox.gv);
                };
            } else {
                opraEl.el.onclick = () => {
                    // @ts-ignore
                    o.fun();
                };
            }
            return opraEl;
        };
        opraEl.clear().add(opraList.map((i) => createOpraEl(i)));
        opraEl.add(
            input("search")
                .attr({ placeholder: "搜索" })
                .on("input", (_e, el) => {
                    this.filter(el.gv);
                }),
        );
    }
    focus() {
        this.#showOpra();
    }
}

function getNowFileV() {
    return fileViews[nowFileIndex] ?? fileViews[0] ?? null;
}

// todo ftp
// todo webdav

const x = new URLSearchParams(location.search);

if (x.get("path")) {
    const nowPath = x.get("path") as string;
    const el = view().addInto(contentEl);
    const v = new FileView(el, opraEl);
    fileViews.push(v);
    nowFileIndex = fileViews.length - 1;
    v.setPath(nowPath);
    v.focus();
}
