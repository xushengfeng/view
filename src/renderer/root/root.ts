// @auto-path:../assets/icons
function getImgUrl(name: string) {
    return new URL(`../assets/icons/${name}`, import.meta.url).href;
}

export { getImgUrl };
