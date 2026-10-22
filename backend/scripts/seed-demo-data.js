/**
 * @file backend/scripts/seed-demo-data.js
 * @description Script khởi tạo dữ liệu mẫu (Sample Data & Admin/Student users) cho dự án IELTSZone
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const { pool } = require('../src/db/pool');

async function seed() {
  console.log('🌱 Đang khởi tạo dữ liệu mẫu cho IELTSZone...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Tạo Mật khẩu hash chung cho tài khoản demo (mật khẩu: 12345678)
    const passwordHash = await bcrypt.hash('12345678', 12);

    // 2. Thêm / Cập nhật tài khoản Admin mẫu
    const adminRes = await client.query(`
      INSERT INTO users (email, password_hash, full_name, role, status)
      VALUES ('admin@ieltszone.com', $1, 'System Admin', 'admin', 'active')
      ON CONFLICT (email) DO UPDATE SET status = 'active', password_hash = $1
      RETURNING id;
    `, [passwordHash]);

    // 3. Thêm / Cập nhật tài khoản Học viên mẫu
    await client.query(`
      INSERT INTO users (email, password_hash, full_name, role, status)
      VALUES ('student@ieltszone.com', $1, 'Học Viên Demo', 'student', 'active')
      ON CONFLICT (email) DO UPDATE SET status = 'active', password_hash = $1;
    `, [passwordHash]);

    // 4. Tự động kích hoạt tất cả các tài khoản đang ở trạng thái 'pending'
    await client.query(`
      UPDATE users SET status = 'active' WHERE status = 'pending';
    `);

    const adminId = adminRes.rows[0].id;

    // 5. Thêm các đề thi mẫu (Mock Tests)
    const mockTests = [
      {
        title: 'IELTS Academic Reading Test 1 - Climate Change',
        description: 'Đề thi thử IELTS Reading Academic với các chủ đề về Biến đổi khí hậu và Môi trường.',
        skill: 'reading',
        difficulty: 'intermediate',
        duration_minutes: 60,
        is_published: true
      },
      {
        title: 'IELTS Academic Listening Practice Test 1',
        description: 'Bài luyện tập IELTS Listening đầy đủ 4 Sections chuẩn cấu trúc đề thi thật.',
        skill: 'listening',
        difficulty: 'beginner',
        duration_minutes: 40,
        is_published: true
      },
      {
        title: 'IELTS Writing Task 1 & Task 2 - Technology',
        description: 'Đề thi IELTS Writing chủ đề Ảnh hưởng của công nghệ hiện đại tới xã hội.',
        skill: 'writing',
        difficulty: 'advanced',
        duration_minutes: 60,
        is_published: true
      },
      {
        title: 'IELTS Speaking Part 1, 2, 3 - Hometown & Hobbies',
        description: 'Bộ câu hỏi thi nói IELTS Speaking với các chủ đề Quê hương, Sở thích và Công việc.',
        skill: 'speaking',
        difficulty: 'intermediate',
        duration_minutes: 15,
        is_published: true
      }
    ];

    for (const test of mockTests) {
      const checkTest = await client.query(
        'SELECT id FROM mock_tests WHERE title = $1',
        [test.title]
      );
      if (checkTest.rows.length === 0) {
        await client.query(`
          INSERT INTO mock_tests (title, description, skill, difficulty, duration_minutes, is_published, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          test.title,
          test.description,
          test.skill,
          test.difficulty,
          test.duration_minutes,
          test.is_published,
          adminId
        ]);
        console.log(` ✅ Đã tạo đề thi mẫu: ${test.title}`);
      }
    }

    await client.query('COMMIT');
    console.log('\n🎉 Nạp dữ liệu mẫu hoàn tất!');
    console.log('----------------------------------------------------');
    console.log('🔑 Mật khẩu chung cho các tài khoản demo: 12345678');
    console.log('👤 Tài khoản Admin  : admin@ieltszone.com');
    console.log('🎓 Tài khoản Student: student@ieltszone.com');
    console.log('----------------------------------------------------');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi nạp dữ liệu mẫu:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
