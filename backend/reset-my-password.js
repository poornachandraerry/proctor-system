/**
 * One-off script: reset the password for a specific user directly in the
 * database. Uses the same DB connection config (.env) as your migration
 * scripts, so run it exactly the same way you ran db:migrate:v6/v7.
 *
 * Usage:
 *   node reset-my-password.js admin@proctorai.co.in
 *
 * If you omit the email, it defaults to admin@proctorai.co.in.
 * Prints a new temporary password — copy it and log in immediately,
 * then change it from within the app if you'd like something memorable.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('./src/config/database');

async function main() {
  const email = (process.argv[2] || 'admin@proctorai.co.in').toLowerCase();

  const check = await pool.query('SELECT id, first_name, last_name, role FROM users WHERE email=$1', [email]);
  if (!check.rows.length) {
    console.error(`No user found with email: ${email}`);
    console.error('Double-check the email, or list existing admins with:');
    console.error(`  SELECT email, role FROM users WHERE role='admin';`);
    process.exit(1);
  }

  const user = check.rows[0];
  const tempPassword = crypto.randomBytes(6).toString('hex') + 'Aa1!';
  const hash = await bcrypt.hash(tempPassword, 12);

  await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, user.id]);

  console.log('');
  console.log('✅ Password reset successful');
  console.log('----------------------------------------');
  console.log(`User:     ${user.first_name} ${user.last_name} (${user.role})`);
  console.log(`Email:    ${email}`);
  console.log(`Password: ${tempPassword}`);
  console.log('----------------------------------------');
  console.log('Log in now with the above, then change it if you like.');
  console.log('');
  process.exit(0);
}

main().catch(err => {
  console.error('Failed to reset password:', err.message);
  process.exit(1);
});
