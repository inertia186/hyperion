"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const universe_log_1 = require("universe-log");
class Log extends universe_log_1.AbstractUniverseLog {
    constructor() {
        super({
            levelEnvs: ["HIVE_CONTENT_RENDERER_LOG_LEVEL", "HYPERION_LOG_LEVEL"],
            metadata: {
                library: "hive-content-renderer",
            },
        });
    }
    static log() {
        return Log.INSTANCE;
    }
    initialize() {
        super.init();
    }
    init() {
        throw new Error("Instead of #init() please call #initialize() which indirectly overrides init");
    }
}
Log.INSTANCE = new Log();
exports.Log = Log;
//# sourceMappingURL=Log.js.map
