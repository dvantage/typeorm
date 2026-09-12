export interface TransactionRetryPolicy {
    shouldRetry(transactionError: unknown, retryNumber: number): boolean

    delayBeforeRetry(retryNumber: number): number

    restartTransaction(): Promise<void>
}
