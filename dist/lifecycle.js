/** Executes an adapter and returns lifecycle status plus evidence captured so far. */
export async function executeConsumer(adapter, context, source) {
    try {
        await adapter.run(context);
        return { status: "completed", observations: source.snapshot() };
    }
    catch (error) {
        return { status: "failed", error, observations: source.snapshot() };
    }
}
