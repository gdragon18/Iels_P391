import { beforeEach, describe, expect, it, vi } from 'vitest';
import gradingService from '../../src/services/grading.service';
import api from '../../src/services/api';

vi.mock('../../src/services/api', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

describe('grading service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    globalThis.fetch = vi.fn();
  });

  it('uses signed upload without cookies and returns only the opaque token', async () => {
    api.post.mockResolvedValueOnce({ data: { data: {
      upload_url: 'https://storage.example/upload',
      upload_token: 'opaque-upload-token',
      required_headers: { 'content-type': 'audio/mp4', 'x-checksum': 'value' },
    } } });
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const blob = new Blob(['audio'], { type: 'audio/mp4' });
    const result = await gradingService.uploadAudio(blob, { partNumber: 2, durationMs: 1200 });

    expect(api.post).toHaveBeenCalledWith('/submissions/speaking/audio-uploads', expect.objectContaining({
      part_number: 2,
      content_type: 'audio/mp4',
      size_bytes: blob.size,
      duration_ms: 1200,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(globalThis.fetch).toHaveBeenCalledWith('https://storage.example/upload', expect.objectContaining({
      method: 'PUT',
      credentials: 'omit',
      body: blob,
    }));
    expect(result).toEqual({ success: true, data: { upload_token: 'opaque-upload-token', part_number: 2 } });
  });

  it('rejects an unapproved recorder MIME before contacting the API', async () => {
    await expect(gradingService.uploadAudio(
      new Blob(['audio'], { type: 'audio/webm' }),
      { partNumber: 1, durationMs: 1000 },
    )).rejects.toThrow('định dạng audio');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('submits tutor speaking group with idempotency key', async () => {
    const key = gradingService.getOrCreateSpeakingIdempotencyKey('test-1');
    api.post.mockResolvedValueOnce({ data: { success: true, data: {
      speaking_group_id: 'group-tutor', status: 'pending',
    } } });
    const payload = { test_id: 'test-1', grader: 'tutor', parts: [] };
    const response = await gradingService.submitFullSpeaking(payload);
    expect(api.post).toHaveBeenCalledWith('/submissions/speaking/full', payload, {
      headers: { 'Idempotency-Key': key },
    });
    expect(response.data.status).toBe('pending');
    expect(window.sessionStorage.getItem('speaking:idempotency:test-1')).toBeNull();
  });

  it('claims a whole Speaking group before tutor navigation', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true, data: { assignment_status: 'claimed' } } });
    await expect(gradingService.claimSpeakingGroup('group-1'))
      .resolves.toMatchObject({ data: { assignment_status: 'claimed' } });
    expect(api.post).toHaveBeenCalledWith('/tutors/submissions/speaking/group-1/claim');
  });

  it('keeps existing Writing and feedback calls compatible', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true, data: { writing_group_id: 'writing-1' } } });
    await gradingService.submitFullWriting({ grader: 'tutor', tasks: [] });
    expect(api.post).toHaveBeenCalledWith(
      '/submissions/writing/full',
      { grader: 'tutor', tasks: [] },
      { headers: { 'Idempotency-Key': expect.any(String) } }
    );
    api.get.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await gradingService.getFeedback('writing-1', 'writing');
    expect(api.get).toHaveBeenCalledWith('/submissions/writing-1/feedback', { params: { type: 'writing' } });
  });
});
