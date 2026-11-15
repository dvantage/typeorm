import { expect } from "chai"
import sinon from "sinon"
import { CockroachTransactionRetryPolicy } from "../../../../src/driver/cockroachdb/CockroachTransactionRetryPolicy"
import type { CockroachQueryRunner } from "../../../../src/driver/cockroachdb/CockroachQueryRunner"
import { QueryFailedError } from "../../../../src/error/QueryFailedError"

const createQueryFailedError = (errorCode: string): QueryFailedError => {
    const driverError = Object.assign(new Error("database conflict"), {
        code: errorCode,
    })
    return new QueryFailedError("SELECT 1", [], driverError)
}

const createRetryPolicy = (
    maxTransactionRetries: number | undefined,
    restartTransaction: sinon.SinonStub = sinon.stub().resolves(),
): CockroachTransactionRetryPolicy =>
    new CockroachTransactionRetryPolicy({
        driver: { options: { maxTransactionRetries } },
        restartTransaction,
    } as unknown as CockroachQueryRunner)

describe("driver > cockroachdb > transaction retry policy", () => {
    afterEach(() => sinon.restore())

    it("should retry serialization failures up to the configured limit", () => {
        const retryPolicy = createRetryPolicy(2)
        const serializationFailure = createQueryFailedError("40001")

        expect(retryPolicy.shouldRetry(serializationFailure, 1)).to.be.true
        expect(retryPolicy.shouldRetry(serializationFailure, 2)).to.be.true
        expect(retryPolicy.shouldRetry(serializationFailure, 3)).to.be.false
    })

    it("should allow five retries by default", () => {
        const retryPolicy = createRetryPolicy(undefined)
        const serializationFailure = createQueryFailedError("40001")

        expect(retryPolicy.maxRetries).to.equal(5)
        expect(retryPolicy.shouldRetry(serializationFailure, 5)).to.be.true
        expect(retryPolicy.shouldRetry(serializationFailure, 6)).to.be.false
    })

    it("should never retry when the limit is zero or negative", () => {
        const serializationFailure = createQueryFailedError("40001")

        expect(createRetryPolicy(0).shouldRetry(serializationFailure, 1)).to.be
            .false
        expect(createRetryPolicy(-1).shouldRetry(serializationFailure, 1)).to.be
            .false
    })

    it("should not retry errors other than serialization failures", () => {
        const retryPolicy = createRetryPolicy(5)

        expect(retryPolicy.shouldRetry(createQueryFailedError("23505"), 1)).to
            .be.false
        expect(retryPolicy.shouldRetry(new Error("40001"), 1)).to.be.false
        expect(
            retryPolicy.shouldRetry(
                new QueryFailedError("SELECT 1", [], new Error("no code")),
                1,
            ),
        ).to.be.false
    })

    it("should double the delay per retry and cap it", () => {
        sinon.stub(Math, "random").returns(0.5)
        const retryPolicy = createRetryPolicy(5)

        expect(
            [1, 2, 3, 4, 5, 6].map((retryNumber) =>
                retryPolicy.delayBeforeRetry(retryNumber),
            ),
        ).to.deep.equal([25, 50, 100, 200, 400, 400])
    })

    it("should jitter the delay between half and one and a half of the base", () => {
        const retryPolicy = createRetryPolicy(5)
        const randomStub = sinon.stub(Math, "random")

        randomStub.returns(0)
        expect(retryPolicy.delayBeforeRetry(3)).to.equal(50)
        randomStub.returns(0.999)
        expect(retryPolicy.delayBeforeRetry(3)).to.equal(150)
    })

    it("should restart the transaction through the query runner", async () => {
        const restartTransaction = sinon.stub().resolves()
        const retryPolicy = createRetryPolicy(5, restartTransaction)

        await retryPolicy.restartTransaction()

        expect(restartTransaction).to.have.been.calledOnce
    })
})
