#!/usr/bin/env node
export interface McpServerEnvOptions {
    envFile?: string;
    envTestFile?: string;
    port: string;
    processEnv?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}
export declare function buildMcpServerEnv(options: McpServerEnvOptions): Record<string, string>;
//# sourceMappingURL=mcp-server.d.ts.map