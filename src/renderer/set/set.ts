import { t, lan } from "../../../lib/translate/translate";

function init_el() {
    document.body.querySelectorAll("[data-path]").forEach((el) => {});
}

import pack from "../../../package.json?raw";
var package_json = JSON.parse(pack);
document.getElementById("name").innerHTML = package_json.name;
document.getElementById("version").innerHTML = package_json.version;
document.getElementById("description").innerHTML = t(package_json.description);

document.getElementById("info").innerHTML = `<div>${t("项目主页:")} <a href="${package_json.homepage}">${
    package_json.homepage
}</a></div>
    <div><a href="https://github.com/xushengfeng/eSearch/releases/tag/${package_json.version}">${t(
    "更新日志"
)}</a></div>
    <div><a href="https://github.com/xushengfeng/eSearch/issues">${t("错误报告与建议")}</a></div>
    <div>${t("本软件遵循")} <a href="https://www.gnu.org/licenses/gpl-3.0.html">${package_json.license}</a></div>
    <div>${t("本软件基于")} <a href="https://esearch.vercel.app/readme/all_license.json">${t("这些软件")}</a></div>
    <div>Copyright (C) 2021 ${package_json.author.name} ${package_json.author.email}</div>`;
