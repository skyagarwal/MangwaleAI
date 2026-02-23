require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const config = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'secret',
    database: process.env.MYSQL_DATABASE || 'mangwale',
  };

  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  });

  // Ensure DB exists
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``);
  await conn.changeUser({ database: config.database });

  const [tables] = await conn.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
    [config.database]
  );

  const summary = { database: config.database, tables: [] };
  for (const row of tables) {
    const table = row.TABLE_NAME || row.table_name;
    const [[{ cnt }]] = await conn.query(`SELECT COUNT(1) AS cnt FROM \`${table}\``).catch(() => [[{ cnt: 0 }]]);
    const [cols] = await conn.query(
      `SELECT column_name, data_type, is_nullable, column_key, column_default
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`,
      [config.database, table]
    );
    const [sample] = await conn.query(`SELECT * FROM \`${table}\` LIMIT 3`).catch(() => [[]]);
    const [fks] = await conn.query(
      `SELECT k.CONSTRAINT_NAME as constraint_name, k.TABLE_NAME as table_name, k.COLUMN_NAME as column_name,
              k.REFERENCED_TABLE_NAME as referenced_table, k.REFERENCED_COLUMN_NAME as referenced_column
       FROM information_schema.KEY_COLUMN_USAGE k
       WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
       ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
      [config.database, table]
    );
    const [idx] = await conn.query(
      `SELECT INDEX_NAME as index_name, NON_UNIQUE as non_unique, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       GROUP BY INDEX_NAME, NON_UNIQUE`,
      [config.database, table]
    );
    summary.tables.push({
      name: table,
      rowCount: Number(cnt),
      columns: cols.map(c => ({
        name: c.COLUMN_NAME || c.column_name,
        type: c.DATA_TYPE || c.data_type,
        nullable: (c.IS_NULLABLE || c.is_nullable) === 'YES',
        key: c.COLUMN_KEY || c.column_key,
        default: c.COLUMN_DEFAULT || c.column_default,
      })),
      foreignKeys: fks,
      indexes: idx.map(i => ({ name: i.index_name, unique: Number(i.non_unique) === 0, columns: (i.columns || '').split(',') })),
      sampleRows: sample,
    });
  }

  console.log(JSON.stringify(summary, null, 2));
  await conn.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
