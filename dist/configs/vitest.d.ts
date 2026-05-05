import type { UserWorkspaceConfig } from 'vitest/config';
export interface VitestPresetOpts {
    /**
     * Project-relative paths для test-projects.
     * По умолчанию unit/component/integration в test/.
     */
    testDirs?: {
        unit?: string;
        component?: string;
        integration?: string;
    };
    /** Дополнительный globalSetup поверх стандартного для integration. */
    extraGlobalSetup?: string[];
}
export declare function defineVitestPreset(opts?: VitestPresetOpts): UserWorkspaceConfig;
//# sourceMappingURL=vitest.d.ts.map