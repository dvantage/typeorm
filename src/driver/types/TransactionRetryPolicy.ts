/**
 * Decides when a failed transaction callback runs again and restarts the transaction for it.
 */
export interface TransactionRetryPolicy {
    /**
     * Checks if the transaction callback must run again after the given error.
     */
    shouldRetry(transactionError: unknown, retryNumber: number): boolean

    /**
     * Returns the delay in milliseconds before the given retry.
     */
    delayBeforeRetry(retryNumber: number): number

    /**
     * Restarts the transaction, so the callback can run again.
     */
    restartTransaction(): Promise<void>
}
