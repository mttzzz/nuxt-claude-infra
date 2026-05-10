export type SetupFn = (opts: {
    host: string;
}) => Promise<void>;
export declare function createUseSharedNuxt(setup: SetupFn): () => Promise<void>;
//# sourceMappingURL=use-shared-nuxt.d.ts.map