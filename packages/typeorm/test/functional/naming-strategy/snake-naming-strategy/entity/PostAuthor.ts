import { Column, Entity, PrimaryColumn } from "../../../../../src"

@Entity()
export class PostAuthor {
    @PrimaryColumn()
    id: number

    @Column()
    firstName: string
}
