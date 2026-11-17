import { Column, Entity, PrimaryColumn } from "../../../../../src"

@Entity()
export class PostCategory {
    @PrimaryColumn()
    id: number

    @Column()
    name: string
}
