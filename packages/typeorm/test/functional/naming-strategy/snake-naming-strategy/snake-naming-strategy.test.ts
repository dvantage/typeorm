import "reflect-metadata"
import "../../../utils/test-setup"
import type { DataSource } from "../../../../src"
import { SnakeNamingStrategy } from "../../../../src"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../../utils/test-utils"
import { BlogPost } from "./entity/BlogPost"
import { PostAuthor } from "./entity/PostAuthor"
import { PostCategory } from "./entity/PostCategory"

describe("naming strategy > snake naming strategy", () => {
    let dataSources: DataSource[]
    before(async () => {
        dataSources = await createTestingConnections({
            __dirname,
            namingStrategy: new SnakeNamingStrategy(),
            disabledDrivers: ["spanner"],
        })
    })
    beforeEach(() => reloadTestingDatabases(dataSources))
    after(() => closeTestingConnections(dataSources))

    it("names tables, columns, join columns and junction tables in snake_case", () =>
        dataSources.forEach((dataSource) => {
            const postMetadata = dataSource.getMetadata(BlogPost)
            postMetadata.tableName.should.be.equal("blog_post")
            postMetadata.columns
                .map((column) => column.databaseName)
                .should.have.members([
                    "id",
                    "title",
                    "post_counters_likes_count",
                    "author_id",
                ])

            const authorMetadata = dataSource.getMetadata(PostAuthor)
            authorMetadata.tableName.should.be.equal("post_author")
            authorMetadata.columns
                .map((column) => column.databaseName)
                .should.have.members(["id", "first_name"])

            const junctionMetadata =
                postMetadata.manyToManyRelations[0].junctionEntityMetadata!
            junctionMetadata.tableName.should.be.equal(
                "blog_post_categories_post_category",
            )
            junctionMetadata.columns
                .map((column) => column.databaseName)
                .should.have.members(["blog_post_id", "post_category_id"])
        }))

    it("saves and loads entities through the snake_case schema", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const author = await dataSource.manager.save(PostAuthor, {
                    id: 1,
                    firstName: "Timber",
                })
                const category = await dataSource.manager.save(PostCategory, {
                    id: 1,
                    name: "orm",
                })
                await dataSource.manager.save(BlogPost, {
                    id: 1,
                    title: "Snake case",
                    postCounters: { likesCount: 3 },
                    author,
                    categories: [category],
                })

                const loadedPost = await dataSource.manager.findOne(BlogPost, {
                    where: { id: 1 },
                    relations: { author: true, categories: true },
                })
                loadedPost!.should.be.eql({
                    id: 1,
                    title: "Snake case",
                    postCounters: { likesCount: 3 },
                    author: { id: 1, firstName: "Timber" },
                    categories: [{ id: 1, name: "orm" }],
                })
            }),
        ))
})
