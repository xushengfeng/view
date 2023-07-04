export interface setting {
    firstRun: boolean;
    settingVersion: string;

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
