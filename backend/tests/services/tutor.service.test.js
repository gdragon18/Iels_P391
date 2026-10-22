jest.mock('../../src/db/pool', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../../src/services/audit.service', () => ({
  logAction: jest.fn(),
}));

jest.mock('../../src/services/speakingSubmission.service', () => ({
  getSpeakingSubmissionService: jest.fn(),
}));

jest.mock('../../src/db/queries/grading.queries', () => ({
  ...jest.requireActual('../../src/db/queries/grading.queries'),
  getSpeakingAssignmentScope: jest.fn(),
}));

const TutorService = require('../../src/services/tutor.service');
const { pool } = require('../../src/db/pool');
const AuditLogService = require('../../src/services/audit.service');
const { getSpeakingSubmissionService } = require('../../src/services/speakingSubmission.service');
const gradingQueries = require('../../src/db/queries/grading.queries');

const rowsForColumns = (columns) => ({
  rows: columns.map(column_name => ({ column_name })),
});

describe('TutorService schema compatibility', () => {
  beforeEach(() => {
    pool.query.mockReset();
    pool.connect.mockReset();
    AuditLogService.logAction.mockReset();
    getSpeakingSubmissionService.mockReset();
    gradingQueries.getSpeakingAssignmentScope.mockReset();
    gradingQueries.getSpeakingAssignmentScope.mockResolvedValue({
      part_count: 3,
      assigned: true,
    });
  });

  it('submits tutor writing grade without requiring tutor_feedback_reports.task_number', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValueOnce(client);
    AuditLogService.logAction.mockResolvedValueOnce({});

    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'task-1',
          writing_group_id: 'group-1',
          status: 'pending',
          grader: 'tutor',
          user_id: 'student-1',
          student_name: 'Student One',
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'task-1', task_number: 1, status: 'pending', grader: 'tutor' },
          { id: 'task-2', task_number: 2, status: 'pending', grader: 'tutor' },
        ],
      })
      .mockResolvedValueOnce(rowsForColumns([
        'id',
        'tutor_id',
        'writing_submission_id',
        'band_score',
        'task_achievement_score',
        'coherence_score',
        'lexical_score',
        'grammar_score',
        'written_feedback',
        'created_at',
        'updated_at',
      ]))
      .mockResolvedValueOnce(rowsForColumns([
        'id',
        'writing_group_id',
        'status',
        'updated_at',
      ]))
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { task_number: 1, band_score: '6.5' },
          { task_number: 2, band_score: null },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({}); // COMMIT

    await TutorService.gradeSubmission('writing', 'group-1', 'tutor-1', {
      taskNumber: 1,
      bandScore: 6.5,
      taskAchievementScore: 6.5,
      coherenceScore: 6.5,
      lexicalScore: 6.5,
      grammarScore: 6.5,
      writtenFeedback: 'Good structure.',
    });

    const feedbackWrites = client.query.mock.calls
      .map(([query]) => query)
      .filter(query => query.includes('tutor_feedback_reports') && !query.includes('LEFT JOIN'));

    expect(feedbackWrites.join('\n')).not.toMatch(/\btask_number\b/);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'pending'::submission_status"),
      ['group-1']
    );
  });

  it('submits tutor speaking grade without locking the nullable joined user row', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValueOnce(client);
    AuditLogService.logAction.mockResolvedValueOnce({});

    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'part-1',
          speaking_group_id: 'group-1',
          status: 'pending',
          grader: 'tutor',
          user_id: 'student-1',
          student_name: 'Student One',
        }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'part-1', status: 'pending', grader: 'tutor', assigned_tutor_id: 'tutor-1' },
          { id: 'part-2', status: 'pending', grader: 'tutor', assigned_tutor_id: 'tutor-1' },
          { id: 'part-3', status: 'pending', grader: 'tutor', assigned_tutor_id: 'tutor-1' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'part-1' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({}); // COMMIT

    const result = await TutorService.gradeSubmission('speaking', 'group-1', 'tutor-1', {
      bandScore: 6,
      fluencyScore: 6,
      lexicalScore: 6,
      grammarScore: 6,
      pronunciationScore: 6,
      writtenFeedback: 'Overall speaking feedback.',
    });

    expect(client.query.mock.calls[1][0]).toContain('FOR UPDATE OF ss');
    expect(client.query.mock.calls[1][0]).toContain('ss.speaking_group_id::text = $1');
    expect(result).toEqual(expect.objectContaining({
      success: true,
      studentId: 'student-1',
      tutorStatus: 'graded',
      overallTutorBand: 6,
    }));
  });
});

