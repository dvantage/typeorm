import { QueryFailedError } from "../../error/QueryFailedError"
import type { TransactionRetryPolicy } from "../types/TransactionRetryPolicy"
import type { CockroachQueryRunner } from "./CockroachQueryRunner"

const DEFAULT_MAX_TRANSACTION_RETRIES = 5
const SERIALIZATION_FAILURE_ERROR_CODE = "40001"
const BASE_RETRY_DELAY_MS = 25
const MAX_RETRY_DELAY_MS = 400

export class CockroachTransactionRetryPolicy implements TransactionRetryPolicy {
    readonly maxRetries: number

    protected queryRunner: CockroachQueryRunner

    constructor(queryRunner: CockroachQueryRunner) {
        this.queryRunner = queryRunner
        this.maxRetries = Math.max(
            queryRunner.driver.options.maxTransactionRetries ??
                DEFAULT_MAX_TRANSACTION_RETRIES,
            0,
        )
    }

    shouldRetry(transactionError: unknown, retryNumber: number): boolean {
        return (
            retryNumber <= this.maxRetries &&
            this.isSerializationFailure(transactionError)
        )
    }

    delayBeforeRetry(retryNumber: number): number {
        const exponentialDelay = BASE_RETRY_DELAY_MS * 2 ** (retryNumber - 1)
        const boundedDelay = Math.min(exponentialDelay, MAX_RETRY_DELAY_MS)
        const jitterMultiplier = 0.5 + Math.random()

        return Math.round(boundedDelay * jitterMultiplier)
    }

    restartTransaction(): Promise<void> {
        return this.queryRunner.restartTransaction()
    }

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
