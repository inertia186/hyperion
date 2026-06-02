export interface AssetEmbedderOptions {
    ipfsPrefix: string;
    width: number;
    height: number;
    hideImages: boolean;
    baseUrl: string;
    imageProxyFn: (url: string) => string;
    hashtagUrlFn: (hashtag: string) => string;
    usertagUrlFn: (account: string) => string;
}
export declare namespace AssetEmbedderOptions {
    function validate(o: AssetEmbedderOptions): void;
}
