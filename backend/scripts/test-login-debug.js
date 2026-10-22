const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const authService = require('../src/services/auth.service');

async function test() {
  try {
    console.log('Testing login for admin@ieltszone.com...');
    const result = await authService.login('admin@ieltszone.com', '12345678', '127.0.0.1', 'test-agent');
    console.log('✅ Login SUCCESS:', result);
  } catch (err) {
    console.error('❌ Login ERROR:', err);
  } finally {
    process.exit(0);
  }
}

test();
