import type { DataSource } from "../../../src"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../utils/test-utils"
import { Post } from "./entity/Post.js"
import { expect } from "chai"

describe("github issues > #9984 TransactionRetryWithProtoRefreshError should be handled by TypeORM", () => {
    let dataSources: DataSource[]

    before(async () => {
        dataSources = await createTestingConnections({
            entities: [Post],
            enabledDrivers: ["cockroachdb"],
        })
    })

    beforeEach(() => reloadTestingDatabases(dataSources))
    after(() => closeTestingConnections(dataSources))

    it("should retry transaction on 40001 error with 'inject_retry_errors_enabled=true'", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const queryRunner = dataSource.createQueryRunner()
                await queryRunner.query(
                    "SET inject_retry_errors_enabled = true",
                )

                const post = new Post()
                post.name = `post`
                await queryRunner.manager.transaction((entityManager) =>
                    entityManager.save(post),
                )

                await queryRunner.query(
                    "SET inject_retry_errors_enabled = false",
                )
                await queryRunner.release()
                const loadedPost = await dataSource.manager.findOneBy(Post, {
                    id: post.id,
                })
                expect(loadedPost).to.be.not.undefined
            }),
        ))

    it("should retry transaction on 40001 error", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const post = new Post()
                post.name = "post"
                await dataSource.manager.save(post)

                const renamePost = (name: string) =>
                    dataSource.transaction(async (entityManager) => {
                        const updatedPost = new Post()
                        updatedPost.id = post.id
                        updatedPost.name = name
                        await entityManager.save(updatedPost)
                    })

                await Promise.all(
                    [1, 2, 3].map((renameNumber) =>
                        renamePost(`changed_${renameNumber}`),
                    ),
                )

                const loadedPost = await dataSource.manager.findOneByOrFail(
                    Post,
                    {
                        id: post.id,
                    },
                )
                expect(loadedPost.name).to.not.equal("post")
            }),
        ))
})
