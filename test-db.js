const { query, pool } = require('./src/config/database');

async function testConnection() {
  try {
    console.log(' Testing database connection...\n');
    
    // Test 1: Simple query
    const result = await query('SELECT NOW()');
    console.log(' Database connection successful!');
    console.log(' Server time:', result.rows[0].now);
    
    // Test 2: Check tables exist
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\n Tables in database:');
    tables.rows.forEach(row => {
      console.log('   - ' + row.table_name);
    });
    
    // Test 3: Check admin user
    const users = await query('SELECT id, username, role FROM users');
    console.log('\n Users in system:');
    users.rows.forEach(user => {
      console.log('   - ' + user.username + ' (' + user.role + ')');
    });
    
    // Test 4: Count records
    const counts = await query(`
      SELECT 
        (SELECT COUNT(*) FROM students) as students,
        (SELECT COUNT(*) FROM staff) as staff,
        (SELECT COUNT(*) FROM classes) as classes,
        (SELECT COUNT(*) FROM academic_terms) as terms
    `);
    
    console.log('\n Database statistics:');
    console.log('   Students: ' + counts.rows[0].students);
    console.log('   Staff: ' + counts.rows[0].staff);
    console.log('   Classes: ' + counts.rows[0].classes);
    console.log('   Terms: ' + counts.rows[0].terms);
    
    console.log('\n All tests passed! Database is ready.');
    
  } catch (error) {
    console.error(' Database connection failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n Connection closed.');
  }
}

testConnection();