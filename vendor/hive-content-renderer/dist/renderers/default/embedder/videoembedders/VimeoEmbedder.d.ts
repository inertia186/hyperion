import { AbstractVideoEmbedder } from "./AbstractVideoEmbedder";
export declare class VimeoEmbedder extends AbstractVideoEmbedder {
    private static TYPE;
    markEmbedIfFound(child: HTMLObjectElement): {
        link: string;
    } | undefined;
    processEmbedIfRelevant(embedType: string, id: string, size: {
        width: number;
        height: number;
    }, htmlElementKey: string): string | undefined;
    private vimeoId;
}
