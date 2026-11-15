/**
 * Used to specify what entity relations should be joined.
 *
 * Example:
 *  const options: JoinOptions = {
 *     alias: "photo",
 *     leftJoin: {
 *         author: "photo.author",
 *         profile: "author.profile"
 *     }
 * };
 */
export interface JoinOptions {
    /**
     * Alias of the main entity.
     */
    alias: string

    /**
     * Object where each key represents the LEFT JOIN alias,
     * and the corresponding value represents the relation path.
     *
     * This method does not select the columns of the joined table.
     */
    leftJoin?: { [key: string]: string }
}
