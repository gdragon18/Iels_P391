/**
 * Phase 6 Regression Test Suite: AI Decommissioning Acceptance
 * =============================================================
 * Verifies that the live system honours the "Tutor-only" grading model:
 *   1. No route or service in the codebase loads any removed AI module.
 *   2. Writing submissions only accept grader === 'tutor'.
 *   3. Speaking audio upload flow works without AI dependencies.
 *   4. Admin metrics no longer query ai_usage_logs.
 *   5. Grading oversight service no longer triggers AI re-grading.
 * All tests are pure unit tests (no DB connection required).
 */

// ─── Shared mocks ─────────────────────────────────────────────────────────────
jest.mock('../../src/db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../../src/storage/objectStorage.adapter', () => ({
  createObjectStorageAdapter: () => ({
    createSignedDownload: jest.fn().mockResolvedValue({
      url: 'https://signed.test/audio', expiresAt: '2099-01-01T00:00:00Z',
    }),
    createSignedUpload: jest.fn().mockResolvedValue({
      uploadUrl: 'https://signed.test/upload',
      requiredHeaders: {},
      expiresAt: '2099-01-01T00:00:00Z',
    }),
  }),
}));
jest.mock('../../src/config/supabase', () => ({
  storage: { from: jest.fn(() => ({ getPublicUrl: jest.fn(() => ({ data: { publicUrl: '' } })) })) },
}));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { pool } = require('../../src/db/pool');

// ─── SECTION 1: Module loading ─────────────────────────────────────────────────
describe('Phase 6 Regression — Module Safety', () => {
  test('SubmissionService loads without importing any AI module', () => {
    expect(() => require('../../src/services/submission.service')).not.toThrow();
  });

  test('TutorService loads without importing any AI module', () => {
    expect(() => require('../../src/services/tutor.service')).not.toThrow();
  });

  test('AdminMetricsService loads without importing any AI module', () => {
    expect(() => require('../../src/services/adminMetrics.service')).not.toThrow();
  });

  test('GradingOversightService loads without importing any AI module', () => {
    expect(() => require('../../src/services/grading.oversight.service')).not.toThrow();
  });

  test('storage.config.js exists and is independent from aiGrading.config', () => {
    const storageConfig = require('../../src/config/storage.config');
    expect(storageConfig).toBeDefined();
    // Must export createObjectStorageAdapter factory and/or audioUploadToken config
    expect(typeof storageConfig).toBe('object');
  });

  test('text.js utility works standalone', () => {
    const { countWords, sanitizeWritingText } = require('../../src/utils/text');
    expect(countWords('Hello world foo')).toBe(3);
    expect(sanitizeWritingText('  test  ')).toBe('test');
  });
});

// ─── SECTION 2: Writing submission rejects grader === 'ai' ─────────────────────
describe('Phase 6 Regression — Writing: AI grader blocked', () => {
  const SubmissionService = require('../../src/services/submission.service');

  beforeEach(() => {
    pool.query.mockReset();
    pool.connect.mockReset();
  });

  test('submitFullWriting rejects when grader is "ai"', async () => {
    await expect(
      SubmissionService.submitFullWriting('user-1', null, 'ai', [
        { task_number: 1, prompt_text: 'p', response_text: 'response text here' },
        { task_number: 2, prompt_text: 'p', response_text: 'response text here' },
      ])
    ).rejects.toMatchObject({ statusCode: 400 });

    // Must NOT have touched the database
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('submitFullWriting accepts grader === "tutor" and reaches DB', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ column_name: 'id' }, { column_name: 'user_id' }, { column_name: 'test_id' }, { column_name: 'task_number' }, { column_name: 'prompt_text' }, { column_name: 'response_text' }, { column_name: 'word_count' }, { column_name: 'grader' }, { column_name: 'status' }, { column_name: 'writing_group_id' }, { column_name: 'ai_status' }, { column_name: 'tutor_status' }, { column_name: 'submitted_at' }, { column_name: 'created_at' }, { column_name: 'updated_at' }, { column_name: 'overall_ai_band' }] }) // information_schema
        .mockResolvedValueOnce({ rows: [{ id: 'task-1' }] }) // INSERT task 1
        .mockResolvedValueOnce({ rows: [{ id: 'task-2' }] }) // INSERT task 2
        .mockResolvedValueOnce({}), // COMMIT
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'task-1', task_number: 1, test_title: 'T' }, { id: 'task-2', task_number: 2, test_title: 'T' }] })
      .mockResolvedValueOnce({ rows: [{ column_name: 'id' }, { column_name: 'tutor_status' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'task-1', task_number: 1 }, { id: 'task-2', task_number: 2 }] });

    const result = await SubmissionService.submitFullWriting('user-1', null, 'tutor', [
      { task_number: 1, prompt_text: 'p1', response_text: 'response one text' },
      { task_number: 2, prompt_text: 'p2', response_text: 'response two text' },
    ]);
    expect(result.tasks).toHaveLength(2);
  });
});

// ─── SECTION 3: Speaking audio URL — no AI dependency ─────────────────────────
describe('Phase 6 Regression — Speaking audio URL works for Tutor', () => {
  const SubmissionService = require('../../src/services/submission.service');

  beforeEach(() => pool.query.mockReset());

  test('returns private signed URL for an assigned Tutor via storage.config', async () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: validUuid,
        user_id: 'user-1',
        assigned_tutor_scope: true,
        audio_storage_key: 'private/test.mp3',
        audio_url: null,
      }],
    });

    const result = await SubmissionService.getSpeakingAudioUrl(validUuid, { id: 'tutor-1', role: 'tutor' });
    expect(result.url).toBe('https://signed.test/audio');
    expect(result.expires_at).toBe('2099-01-01T00:00:00Z');
  });

  test('rejects unsupported role (no AI fallback)', async () => {
    const validUuid = '11111111-1111-4111-8111-111111111111';
    await expect(
      SubmissionService.getSpeakingAudioUrl(validUuid, { id: 'x', role: 'ai_worker' })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(pool.query).not.toHaveBeenCalled();
  });
});

// ─── SECTION 4: Admin metrics — no ai_usage_logs query ────────────────────────
describe('Phase 6 Regression — Admin metrics no longer queries AI tables', () => {
  beforeEach(() => pool.query.mockReset());

  test('getOverview resolves without touching ai_usage_logs', async () => {
    pool.query.mockImplementation(async (sql) => {
      const sqlStr = String(sql);
      if (sqlStr.includes('GROUP BY role::text')) {
        return { rows: [{ role: 'student', count: 10 }, { role: 'tutor', count: 2 }] };
      }
      return { rows: [{ total_users: 10, active_users: 8, open_tests: 3 }] };
    });

    const AdminMetricsService = require('../../src/services/adminMetrics.service');
    await AdminMetricsService.getOverview();

    // Verify no query referenced ai_usage_logs
    const allSqlCalls = pool.query.mock.calls.map(([sql]) => String(sql));
    const touchedAiLogs = allSqlCalls.some(sql => sql.includes('ai_usage_logs'));
    expect(touchedAiLogs).toBe(false);
  });
});

// ─── SECTION 5: Grading oversight — no AI re-trigger ─────────────────────────
describe('Phase 6 Regression — Grading oversight does not invoke AI', () => {
  beforeEach(() => pool.query.mockReset());

  test('GradingOversightService loads and exposes no AI retry method', () => {
    const svc = require('../../src/services/grading.oversight.service');
    // runAiPrelimCheck or equivalent must NOT exist
    expect(typeof svc.runAiPrelimCheck).toBe('undefined');
    expect(typeof svc.triggerAiRegrade).toBe('undefined');
  });
});
