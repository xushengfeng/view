const fs = require("node:fs") as typeof import("fs");
const path = require("node:path") as typeof import("path");

import { addClass, check, type ElType, image, label, p, txt, view } from "dkh-ui";

// import { loadMusicMetadata } from 'music-metadata/lib/core';
// const { loadMusicMetadata } = require("music-metadata");
import { parseBuffer } from "music-metadata";

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

async function renderAudio(filePath: string) {
    const audio = new Audio(`file://${filePath}`);
    audio.controls = true;
    main.add(audio);
    // todo 控件

    const buffer = fs.readFileSync(filePath);

    try {
        // @ts-ignore
        const metadata = await parseBuffer(buffer);
        console.log(metadata);

        if (metadata.common.title) {
            main.add(txt(metadata.common.title));
        }

        if (metadata.common.artists) {
            main.add(txt(metadata.common.artists.join("、")));
        }

        if (metadata.common.album) {
            main.add(txt(metadata.common.album));
        }

        if (metadata.common.picture?.[0]) {
            const base64 = Buffer.from(metadata.common.picture[0].data).toString("base64");
            main.add(
                image(`data:${metadata.common.picture[0].format};base64,${base64}`, "封面").style({ width: "240px" }),
            );
        }

        if (metadata.common.lyrics) {
            const lyrics = metadata.common.lyrics[0].text;
            const lyricEl = view().addInto(main);
            showLyric(lyricEl, lyrics, audio);
        }
    } catch (error) {
        console.error("Error parsing metadata:", error.message);
    }
}

function showLyric(el: ElType<HTMLElement>, lyrics: string, audio: HTMLAudioElement) {
    const l: { time: number; text: string }[] = [];
    for (const lyric of lyrics.trim().split("\n")) {
        const t = lyric.indexOf("]");
        const time = lyric.slice(1, t);
        const text = lyric.slice(t + 1);
        const nt = time.split(".");
        const mainT = nt[0]
            .split(":")
            .map((x) => Number(x))
            .reduce((a, b) => a * 60 + b);
        l.push({ time: mainT * 1000 + Number(nt[1]), text: text.trim() });
    }

    el.add(l.map((v) => p(v.text)));
    const nowLyricClass = addClass({ background: "#ddd" }, {});
    audio.ontimeupdate = () => {
        const t = audio.currentTime * 1000;
        const lyric = l.findLastIndex((x) => x.time <= t);
        const oldEl = el.query(`.${nowLyricClass}`)?.el;
        const newEl = el.query(`:nth-child(${lyric + 1})`)?.el;
        if (oldEl !== newEl) {
            oldEl?.classList.remove(nowLyricClass);
            newEl?.classList.add(nowLyricClass);
        }
    };
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
