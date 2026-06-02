import { AbstractUniverseLog } from "universe-log";
export declare class Log extends AbstractUniverseLog {
    static log(): Log;
    private static INSTANCE;
    private constructor();
    initialize(): void;
    init(): void;
}
