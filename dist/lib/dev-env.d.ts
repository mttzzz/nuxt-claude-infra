export interface DevDbConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
}
export interface ReadDevDbConfigOptions {
    envPath?: string;
    defaultDatabase?: string;
}
export declare function readDevDbConfig(opts?: ReadDevDbConfigOptions): DevDbConfig;
//# sourceMappingURL=dev-env.d.ts.map