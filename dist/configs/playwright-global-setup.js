import { defineTestStack } from '../lib/test-stack.js';
const stack = defineTestStack();
export default async function globalSetup() {
    const handle = await stack.start();
    process.env.NUXT_TEST_HOST = handle.host;
    process.env.CLAUDE_SESSION_ID = handle.sessionId;
    process.env.TEST_POSTGRES_PORT = String(handle.ports.db);
}
