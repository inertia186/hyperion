import ChainedError from "typescript-chained-error";
export declare class SecurityChecker {
    static checkSecurity(text: string, props: {
        allowScriptTag: boolean;
    }): void;
    private static containsScriptTag;
}
export declare namespace SecurityChecker {
    class SecurityError extends ChainedError {
        constructor(message?: string, cause?: Error);
    }
}
