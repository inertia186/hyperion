import { DefaultRendererLocalization } from "../DefaultRendererLocalization";
import { AssetEmbedderOptions } from "./AssetEmbedderOptions";
export declare class AssetEmbedder {
    private options;
    private localization;
    constructor(options: AssetEmbedderOptions, localization: DefaultRendererLocalization);
    markAssets(input: string): string;
    insertAssets(input: string): string;
}
