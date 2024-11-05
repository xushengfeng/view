export interface setting {
    firstRun: boolean;
    settingVersion: string;

    lan: string;

    appearance: {
        theme: "system" | "light" | "dark";
        size: {
            normal: {
                w: number;
                h: number;
                m: boolean;
            };
        };
    };

    searchEngine: {
        default: string;
        engine: {
            [name: string]: {
                des: string;
                img: string;
                url: string;
                sug: string;
                from: "opensearch" | "user";
            };
        };
    };

    windows: {
        // 桌面背景
        desktop: {
            screenId: number;
            id: string;
            url: string;
        }[];
        // 小组件
        fixed: {
            id: string;
            left: string; // css单位
            top: string; // css单位
            width: string; // css单位
            height: string; // css单位
            root: number | null; // 相对屏幕
            onTop: boolean;
            url: string;
        }[];
    };
}

type treeItem = {
    url: string;
    title: string;
    logo: string;
    parent: number;
    next?: number[];
    visits: number[];
};

type syncView = "add" | "close" | "update" | "move" | "restart";

export interface cardData {
    url?: string;
    title?: string;
    icon?: string;
    cover?: string;
    loading?: boolean;
}

export interface DownloadItem {
    id: number | string;
    url: string;
    filename: string;
    status: "pending" | "downloading" | "completed";
    createdAt: number;
}
