import { AbstractVideoEmbedder } from "./AbstractVideoEmbedder";
export declare class YoutubeEmbedder extends AbstractVideoEmbedder {
    /** @return {id, url} or <b>null</b> */
    static getYoutubeMetadataFromLink(data: string): {
        id: string;
        url: string;
        thumbnail: string;
    } | null;
    private static TYPE;
    markEmbedIfFound(child: HTMLObjectElement): {
        image: string;
        link: string;
    } | undefined;
    processEmbedIfRelevant(embedType: string, id: string, size: {
        width: number;
        height: number;
    }, htmlElementKey: string): string | undefined;
}
