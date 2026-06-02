import { AbstractVideoEmbedder } from "./AbstractVideoEmbedder";
export declare class ThreespeakEmbedder extends AbstractVideoEmbedder {
    static TYPE: string;
    static getMetadataFromLink(data: string): {
        id: string;
        url: string;
        canonical: string;
        thumbnail?: string;
    } | null;
    static normalizeIframeUrl(src: string): string | null;
    markEmbedIfFound(child: any): {
        image?: string;
        link?: string;
    } | undefined;
    processEmbedIfRelevant(embedType: string, id: string, size: {
        width: number;
        height: number;
    }, htmlElementKey: string): string | undefined;
}
