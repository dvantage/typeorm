import "reflect-metadata"
import { expect } from "chai"
import type { DataSource } from "../../../../src/data-source/DataSource"
import type { EntityManager } from "../../../../src/entity-manager/EntityManager"
import { QueryFailedError } from "../../../../src/error/QueryFailedError"
import type { QueryRunner } from "../../../../src/query-runner/QueryRunner"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import { Counter } from "./entity/Counter"

const INJECTED_SERIALIZATION_FAILURES = 3

const withInjectedSerializationFailures = async <T>(
    dataSource: DataSource,
    runWithQueryRunner: (queryRunner: QueryRunner) => Promise<T>,
): Promise<T> => {
    const queryRunner = dataSource.createQueryRunner()
    try {
        await queryRunner.query("SET inject_retry_errors_enabled = true")
        return await runWithQueryRunner(queryRunner)
    } finally {
        await queryRunner.query("SET inject_retry_errors_enabled = false")
        await queryRunner.release()
    }
}

const expectSerializationFailure = (transactionError: unknown): void => {
    expect(transactionError).to.be.instanceOf(QueryFailedError)
    expect((transactionError as QueryFailedError).driverError).to.have.property(
        "code",
        "40001",
    )
}

describe("transaction > transaction retry", () => {
    describe("with the default retry limit", () => {
        let dataSources: DataSource[]
        before(async () => {
            dataSources = await createTestingConnections({
                entities: [Counter],
                enabledDrivers: ["cockroachdb"],
            })
        })
        beforeEach(() => reloadTestingDatabases(dataSources))
        after(() => closeTestingConnections(dataSources))

        it("should run the callback again after a serialization failure and commit the last attempt", () =>
            Promise.all(
                dataSources.map(async (dataSource) => {
                    let callbackRuns = 0
                    await withInjectedSerializationFailures(
                        dataSource,
                        (queryRunner) =>
                            queryRunner.manager.transaction(
                                async (entityManager) => {
                                    callbackRuns += 1
                                    await entityManager.insert(Counter, {
                                        id: 1,
                                        value: callbackRuns,
                                    })
                                },
                            ),
                    )

                    expect(callbackRuns).to.equal(
                        INJECTED_SERIALIZATION_FAILURES + 1,
                    )
                    const counter = await dataSource.manager.findOneByOrFail(
                        Counter,
                        { id: 1 },
                    )
                    expect(counter.value).to.equal(callbackRuns)
                }),
            ))

        it("should recompute read-modify-write values on every attempt", () =>
            Promise.all(
                dataSources.map(async (dataSource) => {
                    await dataSource.manager.insert(Counter, {
                        id: 1,
                        value: 0,
                    })
                    const incrementCount = 8
                    await Promise.all(
                        Array.from({ length: incrementCount }, () =>
                            dataSource.transaction(async (entityManager) => {
                                const counter =
                                    await entityManager.findOneByOrFail(
                                        Counter,
                                        { id: 1 },
                                    )
                                await entityManager.update(
                                    Counter,
                                    { id: 1 },
                                    { value: counter.value + 1 },
                                )
                            }),
                        ),
                    )

                    const counter = await dataSource.manager.findOneByOrFail(
                        Counter,
                        { id: 1 },
                    )
                    expect(counter.value).to.equal(incrementCount)
                }),
            ))

        it("should retry the outer transaction when the failure happens inside a nested transaction", () =>
            Promise.all(
                dataSources.map(async (dataSource) => {
                    let outerRuns = 0
                    let nestedRuns = 0
                    await withInjectedSerializationFailures(
                        dataSource,
                        async (queryRunner) => {
                            await queryRunner.manager.transaction(
                                async (entityManager) => {
                                    outerRuns += 1
                                    await entityManager.transaction(
                                        async (nestedEntityManager) => {
                                            nestedRuns += 1
                                            await nestedEntityManager.insert(
                                                Counter,
                                                { id: 1, value: outerRuns },
                                            )
                                        },
                                    )
                                },
                            )
                            await queryRunner.manager.transaction(
                                (entityManager) =>
                                    entityManager.insert(Counter, {
                                        id: 2,
                                        value: 0,
                                    }),
                            )
                        },
                    )

                    expect(outerRuns).to.equal(
                        INJECTED_SERIALIZATION_FAILURES + 1,
                    )
                    expect(nestedRuns).to.equal(outerRuns)
                    const counters = await dataSource.manager.find(Counter, {
                        order: { id: "ASC" },
                    })
                    expect(counters).to.deep.equal([
                        { id: 1, value: outerRuns },
                        { id: 2, value: 0 },
                    ])
                }),
            ))

        it("should not retry an error that is not a serialization failure", () =>
            Promise.all(
                dataSources.map(async (dataSource) => {
                    await dataSource.manager.insert(Counter, {
                        id: 1,
                        value: 0,
                    })
                    let callbackRuns = 0
                    let transactionError: unknown
                    try {
                        await dataSource.transaction(
                            async (entityManager: EntityManager) => {
                                callbackRuns += 1
                                await entityManager.insert(Counter, {
                                    id: 1,
                                    value: 1,
                                })
                            },
                        )
                    } catch (caughtError) {
                        transactionError = caughtError
                    }

                    expect(callbackRuns).to.equal(1)
                    expect(transactionError).to.be.instanceOf(QueryFailedError)
                    expect(
                        (transactionError as QueryFailedError).driverError,
                    ).to.have.property("code", "23505")
                }),
            ))
    })

    describe("with a retry limit below the failure count", () => {
        let dataSources: DataSource[]
        before(async () => {
            dataSources = await createTestingConnections({
                entities: [Counter],
                enabledDrivers: ["cockroachdb"],
                driverSpecific: {
                    maxTransactionRetries: INJECTED_SERIALIZATION_FAILURES - 1,
                },
            })
        })
        beforeEach(() => reloadTestingDatabases(dataSources))
        after(() => closeTestingConnections(dataSources))

        it("should rethrow the serialization failure once the retries are exhausted", () =>
            Promise.all(
                dataSources.map(async (dataSource) => {
                    let callbackRuns = 0
                    let transactionError: unknown
                    await withInjectedSerializationFailures(
                        dataSource,
                        async (queryRunner) => {
                            try {
                                await queryRunner.manager.transaction(
                                    async (entityManager) => {
                                        callbackRuns += 1
                                        await entityManager.insert(Counter, {
                                            id: 1,
                                            value: callbackRuns,
                                        })
                                    },
                                )
                            } catch (caughtError) {
                                transactionError = caughtError
                            }
                            expect(queryRunner.isTransactionActive).to.be.false
                            expect(
                                await queryRunner.manager.count(Counter),
                            ).to.equal(0)
                        },
                    )

                    expect(callbackRuns).to.equal(
                        INJECTED_SERIALIZATION_FAILURES,
                    )
                    expectSerializationFailure(transactionError)
                }),
            ))
    })

    describe("with retries disabled", () => {
        let dataSources: DataSource[]
        before(async () => {
            dataSources = await createTestingConnections({
                entities: [Counter],
                enabledDrivers: ["cockroachdb"],
                driverSpecific: { maxTransactionRetries: 0 },
            })
        })
        beforeEach(() => reloadTestingDatabases(dataSources))
        after(() => closeTestingConnections(dataSources))

        it("should rethrow the first serialization failure without running the callback again", () =>
            Promise.all(
                dataSources.map(async (dataSource) => {
                    let callbackRuns = 0
                    let transactionError: unknown
                    await withInjectedSerializationFailures(
                        dataSource,
                        async (queryRunner) => {
                            try {
                                await queryRunner.manager.transaction(
                                    async (entityManager) => {
                                        callbackRuns += 1
                                        await entityManager.insert(Counter, {
                                            id: 1,
                                            value: callbackRuns,
                                        })
                                    },
                                )
                            } catch (caughtError) {
                                transactionError = caughtError
                            }
                            expect(queryRunner.isTransactionActive).to.be.false
                            expect(
                                await queryRunner.manager.count(Counter),
                            ).to.equal(0)
                        },
                    )

                    expect(callbackRuns).to.equal(1)
                    expectSerializationFailure(transactionError)
                }),
            ))

        it("should leave the connection usable after a serialization failure inside a nested transaction", () =>
            Promise.all(
                dataSources.map(async (dataSource) => {
                    let transactionError: unknown
                    await withInjectedSerializationFailures(
                        dataSource,
                        async (queryRunner) => {
                            try {
                                await queryRunner.manager.transaction(
                                    (entityManager) =>
                                        entityManager.transaction(
                                            (nestedEntityManager) =>
                                                nestedEntityManager.insert(
                                                    Counter,
                                                    { id: 1, value: 1 },
                                                ),
                                        ),
                                )
                            } catch (caughtError) {
                                transactionError = caughtError
                            }
                            expect(queryRunner.isTransactionActive).to.be.false
                            await queryRunner.query(
                                "SET inject_retry_errors_enabled = false",
                            )
                            await queryRunner.manager.transaction(
                                (entityManager) =>
                                    entityManager.insert(Counter, {
                                        id: 2,
                                        value: 2,
                                    }),
                            )
                        },
                    )

                    expectSerializationFailure(transactionError)
                    const counters = await dataSource.manager.find(Counter)
                    expect(counters).to.deep.equal([{ id: 2, value: 2 }])
                }),
            ))
    })
})
