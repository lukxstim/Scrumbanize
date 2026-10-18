/**
 * SQL expression: true when the task with table alias `alias` is in its project's last column, which counts as
 * "done" (there is no separate status).
 */
export const isDoneSql = (alias: string) =>
  `${alias}.column_id = (SELECT id FROM board_columns WHERE project_id = ${alias}.project_id ORDER BY position DESC, id DESC LIMIT 1)`;
