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
}

export interface DownloadItem {
    id: number | string;
    url: string;
    filename: string;
    status: "pending" | "downloading" | "completed";
    createdAt: number;
}
