import { type SessionPorts } from './ports.js';
export interface TestStackHandle {
    sessionId: string;
    /** Базовый URL test-сервера, напр. "http://127.0.0.1:3210". */
    host: string;
    ports: SessionPorts;
    composeProjectName: string;
}
export interface TestStackDeps {
    /** Проектный teardown Drizzle/postgres-js — вызывается в stopTestStack. */
    disconnectDb?: () => Promise<void>;
    /** Override imageTag (по умолчанию <dockerProjectPrefix>-server:latest). */
    imageTag?: string;
    /** Build target для multi-stage Dockerfile. */
    buildTarget?: string;
    /** Дополнительные --build-arg KEY=VALUE. */
    buildArgs?: Record<string, string>;
}
export type PortAllocator = (sessionId: string) => Promise<SessionPorts>;
export type ContainerStarter = (sessionId: string, ports: SessionPorts) => Promise<void>;
export type PortFreer = (sessionId: string) => void | Promise<void>;
export interface AllocateWithRetryOpts {
    allocator: PortAllocator;
    starter: ContainerStarter;
    freer: PortFreer;
    maxAttempts: number;
}
export interface TestStackController {
    start: () => Promise<TestStackHandle>;
    stop: () => Promise<void>;
    current: () => TestStackHandle | null;
}
export declare function allocateWithRetry(sessionId: string, opts: AllocateWithRetryOpts): Promise<SessionPorts>;
export declare function startTestStack(deps?: TestStackDeps): Promise<TestStackHandle>;
export declare function stopTestStack(handleOrSessionId: TestStackHandle | string, deps?: TestStackDeps): Promise<void>;
export declare function defineTestStack(deps?: TestStackDeps): TestStackController;
//# sourceMappingURL=test-stack.d.ts.map