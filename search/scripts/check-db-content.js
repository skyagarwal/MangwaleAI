const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkContent() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '103.86.176.59',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'root_password',
    database: process.env.MYSQL_DATABASE || 'mangwale_db',
  });

  try {
    console.log('--- Stores ---');
    const [stores] = await connection.execute('SELECT name, latitude, longitude FROM stores LIMIT 5');
    console.table(stores);

    console.log('\n--- Items ---');
    // Assuming there is an items table, let's check its name first
    const [tables] = await connection.execute('SHOW TABLES LIKE "items"');
    if (tables.length > 0) {
        const [items] = await connection.execute('SELECT * FROM items LIMIT 1');
        console.log('Item columns:', Object.keys(items[0]));
        const [itemData] = await connection.execute('SELECT name, module_id, store_id FROM items WHERE name LIKE "%Kofta%" LIMIT 5');
        console.table(itemData);
    } else {
        console.log('Table "items" not found. Checking for other tables...');
        const [allTables] = await connection.execute('SHOW TABLES');
        console.log(allTables.map(t => Object.values(t)[0]));
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkContent();
