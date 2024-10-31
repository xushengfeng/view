const fs = require("node:fs") as typeof import("fs");
const path = require("node:path") as typeof import("path");

import { addClass, check, type ElType, image, label, p, pureStyle, spacer, trackPoint, txt, view } from "dkh-ui";

import { getImgUrl } from "../root/root";

// import { loadMusicMetadata } from 'music-metadata/lib/core';
// const { loadMusicMetadata } = require("music-metadata");
import { parseBuffer } from "music-metadata";

// @auto-path:../assets/icons/$.svg
function icon(src: string) {
    return image(getImgUrl(`${src}.svg`), "icon").class("icon");
}

const main = view().addInto();

function mainRenderer(filePath: string) {
    if (filePath.match(/\.(html|htm)$/i)) {
        location.href = filePath;
    }
    document.title = path.basename(filePath);
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
    main.add(audio);

    const music = view("x").style({ justifyContent: "space-evenly" }).addInto(main); // todo < 320 * 2 : y
    const left = view("y")
        .addInto(music)
        .style({ minWidth: "320px", height: "100vh", alignItems: "center", justifyContent: "center" });
    const pictureEl = view().style({ width: "240px", height: "240px" }).addInto(left);
    const nameEl = txt().addInto(left);
    const nameEl2 = txt().addInto(left);
    const artistEl = txt().addInto(nameEl2);
    nameEl2.add(" - ");
    const albumEl = txt().addInto(nameEl2);

    const controlsEl = view("y").style({ alignItems: "center" }).addInto(left);

    const playBtn = check("p", [
        icon("pause").style({ width: "24px" }) /* playing */,
        icon("recume").style({ width: "24px" }),
    ])
        .on("change", () => {
            if (playBtn.gv) {
                audio.play();
            } else {
                audio.pause();
            }
        })
        .sv(false);

    audio.onplay = () => {
        playBtn.sv(true);
    };
    audio.onpause = () => {
        playBtn.sv(false);
    };
    audio.onended = () => {
        playBtn.sv(false);
    };

    audio.onloadedmetadata = () => {
        audio.play();
        playBtn.sv(true);
    };

    controlsEl.add([processEl(audio), playBtn]);
    // todo 音量调节
    // todo loop
    // todo 音乐播放列表

    const lyricEl = view("y")
        .addInto(music)
        .style({ minWidth: "320px", height: "100vh", overflow: "auto", scrollBehavior: "smooth" })
        .class(
            addClass(
                {},
                {
                    "&>*": {
                        padding: "8px",
                        borderRadius: "8px",
                    },
                    "&::-webkit-scrollbar": {
                        display: "none",
                    },
                },
            ),
        );

    const buffer = fs.readFileSync(filePath);

    try {
        // @ts-ignore
        const metadata = await parseBuffer(buffer);
        console.log(metadata);

        nameEl.sv(metadata.common.title ?? path.basename(filePath, path.extname(filePath)));

        artistEl.sv(metadata.common.artists?.join("、") ?? "未知歌手");

        albumEl.sv(metadata.common.album ?? "未知专辑");

        const cover = metadata.common.picture?.[0];
        if (cover) {
            const base64 = Buffer.from(cover.data).toString("base64");
            pictureEl.add(image(`data:${cover.format};base64,${base64}`, "封面").style({ width: "100%" }));
        }

        const lyrics = metadata.common.lyrics?.[0].text;
        if (lyrics) {
            showLyric(lyricEl, lyrics, audio);
        } else {
            // todo 读取文件
            // else
            lyricEl.style({ display: "none" });
        }
    } catch (error) {
        console.error("Error parsing metadata:", error);
    }
}

function processEl(media: HTMLMediaElement) {
    function timeTrans(t: number) {
        const nt = Math.round(t);
        const h = Math.floor(nt / 60 / 60);
        const m = Math.floor((nt - h * 60 * 60) / 60);
        const s = nt % 60;
        const base = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        if (h === 0) {
            return base;
        }
        return `${h}:${base}`;
    }

    const timeNowEl = txt()
        .bindSet((t: number, el) => {
            el.innerText = timeTrans(t);
        })
        .sv(0);
    const timeTotalEl = txt()
        .bindSet((t: number, el) => {
            el.innerText = timeTrans(t);
        })
        .sv(0);
    const processEl = view("x").style({ width: "240px", height: "2px", backgroundColor: "#ddd" });
    const processNowEl = view("x")
        .style({ width: "0%", height: "100%", backgroundColor: "#000" })
        .bindSet((t: number, el) => {
            el.style.width = `${(t / media.duration) * 100}%`;
        })
        .addInto(processEl);
    trackPoint(processEl, {
        start: (e) => {
            return { x: e.offsetX, y: e.offsetY, data: processNowEl.el.offsetWidth };
        },
        ing: (p, _e, { startData }) => {
            processNowEl.style({ width: `${(p.x / startData) * 100}%` });
            return p.x / startData;
        },
        end: (_e, { ingData }) => {
            const time = media.duration * ingData;
            media.currentTime = time;
            timeNowEl.sv(time);
        },
    });

    media.addEventListener("loadedmetadata", () => {
        timeTotalEl.sv(media.duration);
    });

    media.addEventListener("timeupdate", () => {
        timeNowEl.sv(media.currentTime);
        processNowEl.sv(media.currentTime);
    });

    return view("y").add([processEl, view("x").add([timeNowEl, spacer(), timeTotalEl])]);
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

    el.add(
        l.map((v) =>
            p(v.text).on("click", () => {
                audio.currentTime = v.time / 1000;
            }),
        ),
    );
    const nowLyricClass = addClass({ background: "#ddd" }, {});
    audio.addEventListener("timeupdate", () => {
        const t = audio.currentTime * 1000;
        const lyric = l.findLastIndex((x) => x.time <= t);
        const oldEl = el.query(`.${nowLyricClass}`)?.el;
        const newEl = el.query(`:nth-child(${lyric + 1})`)?.el;
        if (oldEl !== newEl) {
            oldEl?.classList.remove(nowLyricClass);
            newEl?.classList.add(nowLyricClass);
            if (newEl) el.el.scrollTop = newEl?.offsetTop - (el.el.offsetHeight - newEl.offsetHeight) / 2;
        }
    });
}

function renderVideo(filePath: string) {
    const video = document.createElement("video");
    video.src = `file://${filePath}`;
    video.controls = true;
    main.add(video);
    // todo 高级控件
    // todo 字幕
}

pureStyle();

const x = new URLSearchParams(location.search);
const filePath = x.get("path");
if (filePath) {
    mainRenderer(filePath);
}
