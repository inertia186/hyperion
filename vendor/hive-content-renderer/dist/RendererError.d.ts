import ChainedError from "typescript-chained-error";
export declare class RendererError extends ChainedError {
    constructor(message?: string, cause?: Error);
}
