import "reflect-metadata"
import "../../../utils/test-setup"
import type { DataSource, FindManyOptions } from "../../../../src"
import { Raw } from "../../../../src"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import { Post } from "./entity/Post"
import { prepareData } from "./find-options-test-utils"

describe("find options > join", () => {
    let dataSources: DataSource[]
    before(async () => {
        dataSources = await createTestingConnections({
            __dirname,
            disabledDrivers: ["spanner"],
        })
    })
    beforeEach(() => reloadTestingDatabases(dataSources))
    after(() => closeTestingConnections(dataSources))

    it("left join without selecting the joined columns", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                await prepareData(dataSource.manager)

                const posts = await dataSource.manager.find(Post, {
                    select: { id: true, title: true },
                    join: {
                        alias: "post",
                        leftJoin: { author: "post.author" },
                    },
                    order: { id: "asc" },
                })
                posts.should.be.eql([
                    { id: 1, title: "Post #1" },
                    { id: 2, title: "Post #2" },
                    { id: 3, title: "Post #3" },
                    { id: 4, title: "Post #4" },
                ])
            }),
        ))

    it("left joined alias in conditions of every find method", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                await prepareData(dataSource.manager)

                const authorJoin = {
                    alias: "post",
                    leftJoin: { author: "post.author" },
                }
                const writtenByTimber = {
                    id: Raw(() => "author.firstName = :firstName", {
                        firstName: "Timber",
                    }),
                }

                const posts = await dataSource.manager.find(Post, {
                    select: { id: true },
                    join: authorJoin,
                    where: writtenByTimber,
                    order: { id: "asc" },
                })
                posts.should.be.eql([{ id: 1 }, { id: 2 }, { id: 4 }])

                const [countedPosts, postCount] =
                    await dataSource.manager.findAndCount(Post, {
                        select: { id: true },
                        join: authorJoin,
                        where: writtenByTimber,
                        order: { id: "asc" },
                    })
                countedPosts.should.be.eql([{ id: 1 }, { id: 2 }, { id: 4 }])
                postCount.should.be.equal(3)

                const firstPost = await dataSource.manager.findOne(Post, {
                    select: { id: true },
                    join: authorJoin,
                    where: writtenByTimber,
                    order: { id: "asc" },
                })
                firstPost!.should.be.eql({ id: 1 })

                const timberPostCount = await dataSource.manager.count(Post, {
                    join: authorJoin,
                    where: writtenByTimber,
                })
                timberPostCount.should.be.equal(3)

                const timberPostExists = await dataSource.manager.exists(Post, {
                    join: authorJoin,
                    where: writtenByTimber,
                })
                timberPostExists.should.be.true
            }),
        ))

    it("removed join types are rejected", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const innerJoinOptions = {
                    join: {
                        alias: "post",
                        innerJoin: { author: "post.author" },
                    },
                } as FindManyOptions<Post>

                await dataSource.manager
                    .find(Post, innerJoinOptions)
                    .should.be.rejectedWith(
                        `"join.innerJoin" option has been removed`,
                    )
            }),
        ))
})
