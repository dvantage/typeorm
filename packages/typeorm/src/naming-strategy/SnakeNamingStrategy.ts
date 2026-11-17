import { DefaultNamingStrategy } from "./DefaultNamingStrategy"
import { snakeCase } from "../util/StringUtils"

/**
 * Naming strategy that names tables and columns in snake_case.
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy {
    columnName(
        propertyName: string,
        customName: string,
        embeddedPrefixes: string[],
    ): string {
        return (
            snakeCase(embeddedPrefixes.concat("").join("_")) +
            (customName || snakeCase(propertyName))
        )
    }

    relationName(propertyName: string): string {
        return snakeCase(propertyName)
    }

    joinColumnName(relationName: string, referencedColumnName: string): string {
        return snakeCase(relationName + "_" + referencedColumnName)
    }

    joinTableColumnName(
        tableName: string,
        propertyName: string,
        columnName?: string,
    ): string {
        return snakeCase(tableName + "_" + (columnName ?? propertyName))
    }
}
