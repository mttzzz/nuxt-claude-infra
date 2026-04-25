import { z } from 'zod';
export declare const ProjectConfigInputSchema: z.ZodObject<{
    dockerProjectPrefix: z.ZodOptional<z.ZodString>;
    testDbName: z.ZodOptional<z.ZodString>;
    ports: z.ZodOptional<z.ZodObject<{
        mcp: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
        test: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
        db: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
        redis: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
    }, z.core.$strip>>;
    paths: z.ZodOptional<z.ZodObject<{
        dockerCompose: z.ZodString;
        sessionsDir: z.ZodString;
        playwrightArtifactsDir: z.ZodString;
    }, z.core.$strip>>;
    killZombiesPatterns: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type ProjectConfigInput = z.infer<typeof ProjectConfigInputSchema>;
export interface ProjectConfig {
    dockerProjectPrefix: string;
    testDbName: string;
    ports: {
        mcp: [number, number];
        test: [number, number];
        db: [number, number];
        redis: [number, number];
    };
    paths: {
        dockerCompose: string;
        sessionsDir: string;
        playwrightArtifactsDir: string;
    };
    killZombiesPatterns: string[];
}
export declare function deriveProjectSlug(cwd: string): string;
export declare function deriveDockerProjectPrefix(cwd: string): string;
export declare function deriveTestDbName(cwd: string): string;
export declare function resolveProjectConfig(input: ProjectConfigInput | undefined, cwd?: string): ProjectConfig;
export declare function loadProjectConfig(path?: string, cwd?: string): Promise<ProjectConfig>;
export declare const ProjectConfigSchema: z.ZodObject<{
    dockerProjectPrefix: z.ZodOptional<z.ZodString>;
    testDbName: z.ZodOptional<z.ZodString>;
    ports: z.ZodOptional<z.ZodObject<{
        mcp: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
        test: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
        db: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
        redis: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
    }, z.core.$strip>>;
    paths: z.ZodOptional<z.ZodObject<{
        dockerCompose: z.ZodString;
        sessionsDir: z.ZodString;
        playwrightArtifactsDir: z.ZodString;
    }, z.core.$strip>>;
    killZombiesPatterns: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
//# sourceMappingURL=config.d.ts.map