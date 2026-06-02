import { AbstractVideoEmbedder } from "./AbstractVideoEmbedder";
export declare class TwitchEmbedder extends AbstractVideoEmbedder {
    private static TYPE;
    markEmbedIfFound(child: HTMLObjectElement): {
        link: string;
    } | undefined;
    processEmbedIfRelevant(embedType: string, id: string, size: {
        width: number;
        height: number;
    }, htmlElementKey: string): string | undefined;
    private twitchId;
}
