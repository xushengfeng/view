function list(pel: HTMLElement, height: number, gap: number, list: any[], render: (list: any) => HTMLElement) {
    let div = document.createElement("div");
    function cal() {
        let top = pel.scrollTop;
        let bottom = top + pel.offsetHeight;

        let start = 0,
            end = 0;
        start = Math.floor((top - gap / 2) / (height + gap));
        end = Math.ceil((bottom + gap / 2) / (height + gap));

        div.innerHTML = "";
        for (let i = start; i <= end; i++) {
            if (!list[i]) continue;
            let el = render(list[i]);
            div.append(el);
            el.style.height = i * (height + gap) + "px";
        }
    }
    cal();
    pel.append(div);
    div.style.height = list.length * (height + gap) - gap + "px";
    pel.onscroll = cal;
}

export default list;
