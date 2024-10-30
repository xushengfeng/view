const fs = require("node:fs") as typeof import("fs");
const path = require("node:path") as typeof import("path");

import { check, label, p, txt, view } from "dkh-ui";

const main = view().addInto();

function mainRenderer(filePath: string) {
    if (filePath.match(/\.(html|htm)$/i)) {
        location.href = filePath;
    }
    if (filePath.match(/\.txt$/i)) {
        renderTxt(filePath);
    } else if (filePath.match(/\.md$/i)) {
        renderMd(filePath);
    }
    if (
        filePath.match(/\.jpg$/i) ||
        filePath.match(/\.png$/i) ||
        filePath.match(/\.gif$/i) ||
        filePath.match(/\.jpeg$/i) ||
        filePath.match(/\.svg$/i) ||
        filePath.match(/\.webp$/i)
    ) {
        renderPhoto(filePath);
    }
    if (filePath.match(/\.mp3$/i) || filePath.match(/\.wav$/i) || filePath.match(/\.flac$/i)) {
        renderAudio(filePath);
    }
    if (filePath.match(/\.mp4$/i) || filePath.match(/\.mov$/i) || filePath.match(/\.avi$/i)) {
        renderVideo(filePath);
    }
}

function renderTxt(filePath: string) {
    const content = fs.readFileSync(filePath, "utf-8");
    main.add(p(content));
}

function renderMd(filePath: string) {
    const content = fs.readFileSync(filePath, "utf-8");
    main.add(p(content));
}

function renderPhoto(filePath: string) {
    const img = new Image();
    img.src = `file://${filePath}`;
    img.onload = () => {
        main.add(img);

        // todo 控件
        // todo 图片缩放
        // todo 图片属性
    };
}

function renderAudio(filePath: string) {
    const audio = new Audio(`file://${filePath}`);
    audio.controls = true;
    main.add(audio);
    // todo 封面
    // todo 源属性
    // todo 歌词
}

function renderVideo(filePath: string) {
    const video = document.createElement("video");
    video.src = `file://${filePath}`;
    video.controls = true;
    main.add(video);
    // todo 高级控件
    // todo 字幕
}

const x = new URLSearchParams(location.search);
if (x.get("path")) {
    const filePath = x.get("path");
    mainRenderer(filePath);
}
