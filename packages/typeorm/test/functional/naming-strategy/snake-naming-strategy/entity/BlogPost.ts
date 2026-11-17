import {
    Column,
    Entity,
    JoinTable,
    ManyToMany,
    ManyToOne,
    PrimaryColumn,
} from "../../../../../src"
import { PostAuthor } from "./PostAuthor"
import { PostCategory } from "./PostCategory"
import { PostCounters } from "./PostCounters"

@Entity()
export class BlogPost {
    @PrimaryColumn()
    id: number

    @Column()
    title: string

    @Column(() => PostCounters)
    postCounters: PostCounters

    @ManyToOne(() => PostAuthor)
    author: PostAuthor

    @ManyToMany(() => PostCategory)
    @JoinTable()
    categories: PostCategory[]
}
