import { ele, p, pack, pureStyle, view } from "dkh-ui";

pureStyle();

pack(document.body).style({
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
});

const h1 = ele("h1")
    .bindSet((m: string, el) => {
        el.innerText = m;
    })
    .addInto();

const details = view().addInto();

const search = new URLSearchParams(location.search);

if (navigator.onLine) {
    switch (search.get("type")) {
        case "did-fail-load":
            h1.sv("加载失败");
            details.add([p(`${"错误代码："}${search.get("err_code")}`), p(`${"错误描述："}${search.get("err_des")}`)]);
            break;
        case "render-process-gone":
            h1.sv("进程崩溃");
            break;
        case "unresponsive":
            h1.sv("页面未响应");
            break;
        case "certificate-error":
            h1.sv("证书错误");
            break;
        default:
            break;
    }
} else {
    h1.sv("无网络连接");
}
