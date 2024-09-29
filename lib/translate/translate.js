export { t, lan };

let language = "";
const l2l = {
    "zh-CN": "zh-HANS",
    "zh-SG": "zh-HANS",
    "zh-TW": "zh-HANT",
    "zh-HK": "zh-HANT",
    "en-GB": "en",
    "en-UK": "en",
    "fr-BE": "fr",
    "fr-CA": "fr",
    "fr-CH": "fr",
    "fr-FR": "fr",
    "fr-LU": "fr",
    "fr-MC": "fr",
    "ru-RU": "ru",
    "es-AR": "es",
    "es-BO": "es",
    "es-CL": "es",
    "es-CO": "es",
    "es-CR": "es",
    "es-DO": "es",
    "es-EC": "es",
    "es-ES": "es",
    "es-GT": "es",
    "es-HN": "es",
    "es-MX": "es",
    "es-NI": "es",
    "es-PA": "es",
    "es-PE": "es",
    "es-PR": "es",
    "es-PY": "es",
    "es-SV": "es",
    "es-UY": "es",
    "es-VE": "es",
    "ar-AE": "ar",
    "ar-BH": "ar",
    "ar-DZ": "ar",
    "ar-EG": "ar",
    "ar-IQ": "ar",
    "ar-JO": "ar",
    "ar-KW": "ar",
    "ar-LB": "ar",
    "ar-LY": "ar",
    "ar-MA": "ar",
    "ar-OM": "ar",
    "ar-QA": "ar",
    "ar-SA": "ar",
    "ar-SY": "ar",
    "ar-TN": "ar",
    "ar-YE": "ar",
};

let obj = {};

/**
 * 切换语言
 * @param {string} lan 语言
 */
function lan(lan) {
    if (!lan) lan = "zh-HANS";
    if (l2l[lan]) lan = l2l[lan];
    language = lan;
    console.log(__dirname);
    if (lan === "zh-HANS") return;
    const path = "lib/translate";
    if (__dirname.endsWith("renderer/assets")) {
        obj = require(`${__dirname}/../../../${path}/${lan}/index.js`);
    } else {
        obj = require(`${__dirname}/../../${path}/${lan}/index.js`);
    }
}

/**
 * 翻译
 * @param {string} text 原文字
 * @returns 翻译后的文字
 */
function t(text) {
    if (language === "zh-HANS") return text;
    if (obj[text]) {
        return obj[text];
    }
        console.log("need to translate:", text);
        return text;
}

// var a = Object.keys(obj).join("\n");
// 复制到翻译器翻译
// var b = "".split("\n");
// var n = 0;
// for (let i in obj) {
//     obj[i]["zh-S"] = b[n];
//     n++;
// }
// JSON.stringify(obj);
