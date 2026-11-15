import { QueryFailedError } from "../../error/QueryFailedError"
import type { TransactionRetryPolicy } from "../types/TransactionRetryPolicy"
import type { CockroachQueryRunner } from "./CockroachQueryRunner"

const DEFAULT_MAX_TRANSACTION_RETRIES = 5
const SERIALIZATION_FAILURE_ERROR_CODE = "40001"
const BASE_RETRY_DELAY_MS = 25
const MAX_RETRY_DELAY_MS = 400

/**
 * Runs transaction callbacks of a CockroachDB query runner again after serialization failures.
 */
export class CockroachTransactionRetryPolicy implements TransactionRetryPolicy {
    /**
     * Maximum number of retries, set by the maxTransactionRetries data source option.
     */
    readonly maxRetries: number

    /**
     * Query runner whose transaction is restarted before a retry.
     */
    protected queryRunner: CockroachQueryRunner

    constructor(queryRunner: CockroachQueryRunner) {
        this.queryRunner = queryRunner
        this.maxRetries = Math.max(
            queryRunner.driver.options.maxTransactionRetries ??
                DEFAULT_MAX_TRANSACTION_RETRIES,
            0,
        )
    }

    /**
     * Checks if the transaction callback must run again after the given error.
     *
     * @param transactionError
     * @param retryNumber
     */
    shouldRetry(transactionError: unknown, retryNumber: number): boolean {
        return (
            retryNumber <= this.maxRetries &&
            this.isSerializationFailure(transactionError)
        )
    }

    /**
     * Returns the delay in milliseconds before the given retry.
     *
     * @param retryNumber
     */
    delayBeforeRetry(retryNumber: number): number {
        const exponentialDelay = BASE_RETRY_DELAY_MS * 2 ** (retryNumber - 1)
        const boundedDelay = Math.min(exponentialDelay, MAX_RETRY_DELAY_MS)
        const jitterMultiplier = 0.5 + Math.random()

        return Math.round(boundedDelay * jitterMultiplier)
    }

    /**
     * Rolls the transaction back to its cockroach_restart savepoint.
     */
    restartTransaction(): Promise<void> {
        return this.queryRunner.restartTransaction()
    }

    /**
     * Checks if the given error is a serialization failure (SQLSTATE 40001).
     *
     * @param transactionError
     */
    protected isSerializationFailure(transactionError: unknown): boolean {
        if (!(transactionError instanceof QueryFailedError)) return false

        const driverError: unknown = transactionError.driverError

        return (
            driverError instanceof Error &&
            "code" in driverError &&
            driverError.code === SERIALIZATION_FAILURE_ERROR_CODE
        )
    }
}
