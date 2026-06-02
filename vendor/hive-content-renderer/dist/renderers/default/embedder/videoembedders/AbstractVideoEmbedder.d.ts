export declare abstract class AbstractVideoEmbedder {
    abstract markEmbedIfFound(textNode: HTMLObjectElement): {
        image?: string;
        link?: string;
    } | undefined;
    abstract processEmbedIfRelevant(embedType: string, id: string, size: {
        width: number;
        height: number;
    }, htmlElementKey: string): string | undefined;
    static getEmbedMarker(id: string, type: string): string;
    static insertAllEmbeds(embedders: AbstractVideoEmbedder[], input: string, size: {
        width: number;
        height: number;
    }): string;
}
