const AppError = require('../utils/AppError');
const {
  canonicalJson,
  promptSnapshot,
  sha256,
} = require('./speakingSubmission.helpers');

const resolvePrompts = async (db, testId, parts) => {
  const result = await db.query(
    `SELECT passage.id, passage.passage_number, passage.title, passage.instruction, passage.content
     FROM mock_tests test
     JOIN test_passages passage ON passage.test_id = test.id
     WHERE test.id = $1 AND test.skill = 'speaking' AND test.is_published IS TRUE
       AND (test.publish_at IS NULL OR test.publish_at <= NOW())
       AND test.review_status = 'approved'
       AND passage.id = ANY($2::uuid[])
     ORDER BY passage.passage_number
     FOR SHARE OF test, passage`,
    [testId, parts.map((part) => part.promptId)]);
  if (result.rows.length !== 3) throw new AppError('Đề Speaking hoặc prompt không khả dụng.', 422, 'SPEAKING_PROMPTS_INVALID');
  const prompts = result.rows.map(promptSnapshot);
  if (prompts.some((prompt, index) => prompt.part_number !== index + 1 || prompt.prompt_id !== parts[index].promptId)) {
    throw new AppError('prompt_id không khớp Part hoặc bài thi.', 422, 'SPEAKING_PROMPTS_INVALID');
  }
  return prompts;
};

const insertSpeakingParts = async ({ db, userId, testId, groupId, prompts, uploads, grader = 'tutor' }) => {
  const inserted = [];
  for (let index = 0; index < 3; index += 1) {
    const upload = uploads[index];
    const prompt = prompts[index];
    const result = await db.query(
      `INSERT INTO speaking_submissions (
         user_id, test_id, part_number, prompt_text, audio_url, grader, status,
         speaking_group_id, audio_storage_key, declared_audio_sha256,
         audio_size_bytes, declared_duration_ms, source_prompt_id, prompt_snapshot_sha256
       ) VALUES ($1,$2,$3,$4,NULL,$5,'pending',$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, part_number, status, submitted_at`,
      [userId, testId, prompt.part_number,
        [prompt.title, prompt.instruction, prompt.content].filter(Boolean).join('\n'), grader,
        groupId, upload.object_key, upload.sha256, upload.size_bytes,
        upload.duration_ms, prompt.prompt_id, sha256(canonicalJson(prompt))]);
    if (result.rows[0]) inserted.push(result.rows[0]);
  }
  return inserted;
};

module.exports = {
  resolvePrompts,
  insertSpeakingParts,
};
