import { AbstractVideoEmbedder } from "./AbstractVideoEmbedder";
export declare class VideoEmbedders {
    static LIST: AbstractVideoEmbedder[];
    static processTextNodeAndInsertEmbeds(node: HTMLObjectElement): {
        links: string[];
        images: string[];
    };
    static insertMarkedEmbedsToRenderedOutput(input: string, size: {
        width: number;
        height: number;
    }): string;
}
