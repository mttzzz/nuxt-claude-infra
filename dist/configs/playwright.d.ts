import type { PlaywrightTestConfig } from '@playwright/test';
export interface PlaywrightPresetOpts {
    /** Test directory (default: `test/e2e`). */
    testDir?: string;
    /** Дополнительные projects (browsers). */
    projects?: PlaywrightTestConfig['projects'];
}
export declare function definePlaywrightPreset(opts?: PlaywrightPresetOpts): PlaywrightTestConfig;
//# sourceMappingURL=playwright.d.ts.map