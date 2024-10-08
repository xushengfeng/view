import { t, lan } from "../../../lib/translate/translate";

function init(store: typeof import("../../../lib/store/renderStore").default) {
    const 模糊 = store.get("全局.模糊");
    if (模糊 !== 0) {
        document.documentElement.style.setProperty("--blur", `blur(${模糊}px)`);
    } else {
        document.documentElement.style.setProperty("--blur", "none");
    }

    document.documentElement.style.setProperty("--alpha", store.get("全局.不透明度").toString());

    document.documentElement.style.setProperty("--icon-color", store.get("全局.图标颜色")[1]);
    lan(store.get("lan"));
    document.title = t(document.title);
}

export { init };
