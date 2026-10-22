const crypto = require('node:crypto');
const AppError = require('../utils/AppError');
const { storageConfig } = require('../config/storage.config');
const { createObjectStorageAdapter } = require('../storage/objectStorage.adapter');
const { createAudioUploadToken, verifyAudioUploadToken } = require('../security/audioUploadToken');
const {
  CONTENT_TYPES,
  MAX_AUDIO_BYTES,
  lockAudioObjects,
  normalizeParts,
  normalizeUploadInput,
  requireUuid,
} = require('./speakingSubmission.helpers');
const {
  insertSpeakingParts,
  resolvePrompts,
} = require('./speakingSubmission.persistence');

class SpeakingSubmissionService {
  constructor({ pool, config = storageConfig, storage, now = () => Date.now(), randomUUID = crypto.randomUUID } = {}) {
    this.pool = pool || require('../db/pool').pool;
    this.config = config;
    this.storage = storage || null;
    this.now = now;
    this.randomUUID = randomUUID;
  }

  getStorage() {
    if (!this.storage) this.storage = createObjectStorageAdapter(this.config);
    return this.storage;
  }

  // Tạo presigned URL và upload token để client có thể tải trực tiếp file âm thanh lên Storage
  async createAudioUpload(userId, body) {
    requireUuid(userId, 'user_id');
    const input = normalizeUploadInput(body);
    const objectKey = `quarantine/speaking/${userId}/${this.randomUUID()}.${input.extension}`;
    const signed = await this.getStorage().createSignedUpload({
      key: objectKey,
      contentType: input.contentType,
      contentLength: input.sizeBytes,
      checksumSha256: input.sha256,
      expiresInSeconds: this.config.signedUploadTtlSeconds,
    });
    const uploadToken = createAudioUploadToken({
      user_id: userId,
      object_key: objectKey,
      part_number: input.partNumber,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
      sha256: input.sha256,
      duration_ms: input.durationMs,
    }, {
      ...this.config.uploadToken,
      now: this.now(),
    });
    return {
      upload_url: signed.uploadUrl,
      upload_token: uploadToken.token,
      required_headers: signed.requiredHeaders || {},
      upload_url_expires_at: signed.expiresAt,
      upload_token_expires_at: uploadToken.expiresAt,
      max_size_bytes: MAX_AUDIO_BYTES,
    };
  }

  // Xác thực tính hợp lệ của các upload token (chống giả mạo, kiểm tra hạn sử dụng)
  verifyTokens(userId, parts, allowExpired) {
    try {
      return parts.map((part) => verifyAudioUploadToken(part.uploadToken, {
        keyring: this.config.uploadToken.keyring,
        now: this.now(),
        expectedUserId: userId,
        expectedPartNumber: part.partNumber,
        allowExpired,
      }));
    } catch (error) {
      if (error.errorCode) throw new AppError(error.message, error.statusCode || 400, error.errorCode);
      throw error;
    }
  }

  // Kiểm tra vật lý trên Cloud Storage xem file âm thanh đã được tải lên đủ chưa, dung lượng và MIME type có khớp không
  async preflightObjects(uploads) {
    if (new Set(uploads.map((upload) => upload.object_key)).size !== uploads.length) {
      throw new AppError('Mỗi Part phải dùng một tệp âm thanh riêng.', 400, 'DUPLICATE_AUDIO_OBJECT');
    }
    const stats = await Promise.all(uploads.map((upload) => this.getStorage().statObject({ key: upload.object_key })));
    stats.forEach((stat, index) => {
      const upload = uploads[index];
      if (!stat) throw new AppError(`Chưa tìm thấy tệp âm thanh Part ${upload.part_number}.`, 422, 'AUDIO_UPLOAD_NOT_FOUND');
      if (Number(stat.size) !== upload.size_bytes) {
        throw new AppError(`Kích thước tệp Part ${upload.part_number} không khớp.`, 422, 'AUDIO_SIZE_MISMATCH');
      }
      const actualType = String(stat.contentType || '').split(';')[0].toLowerCase();
      if (actualType && CONTENT_TYPES.get(actualType)?.normalized !== upload.content_type) {
        throw new AppError(`MIME của Part ${upload.part_number} không khớp.`, 422, 'AUDIO_TYPE_MISMATCH');
      }
    });
  }

  async withTransaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Lưu bài làm nộp cho Tutor vào database
  async persistTutorSubmission(client, input) {
    const { userId, testId, parts, uploads, groupId } = input;
    await lockAudioObjects(client, uploads);
    const prompts = await resolvePrompts(client, testId, parts);
    const inserted = await insertSpeakingParts({
      db: client, userId, testId, groupId, prompts, uploads, grader: 'tutor',
    });
    return { speaking_group_id: groupId, status: 'pending', parts: inserted };
  }

  // Xử lý nộp bài Speaking cho Tutor chấm (kiểm tra token, kiểm tra file storage, lưu database)
  async submitTutorSpeaking({ userId, testId, parts }) {
    requireUuid(userId, 'user_id');
    const normalizedTestId = requireUuid(testId, 'test_id');
    const normalizedParts = normalizeParts(parts);
    const uploads = this.verifyTokens(userId, normalizedParts, false);
    await this.preflightObjects(uploads);
    const groupId = this.randomUUID();
    return this.withTransaction((client) => this.persistTutorSubmission(client, {
      userId, testId: normalizedTestId, parts: normalizedParts, uploads, groupId,
    }));
  }

  async assertGroupAccess(groupId, user) {
    const result = await this.pool.query(
      `SELECT MIN(user_id::text) AS owner_id,
              BOOL_AND(assigned_tutor_id = $2::uuid) AS assigned_to_tutor
       FROM speaking_submissions
       WHERE speaking_group_id = $1 AND deleted_at IS NULL
       HAVING COUNT(*) > 0`, [groupId, user.role === 'tutor' ? user.id : null]);
    const group = result.rows[0];
    if (!group) throw new AppError('Không tìm thấy bài Speaking.', 404, 'SPEAKING_GROUP_NOT_FOUND');
    const allowed = user.role === 'admin'
      || (user.role === 'student' && group.owner_id === user.id)
      || (user.role === 'tutor' && group.assigned_to_tutor === true);
    if (!allowed) throw new AppError('Bạn không có quyền xem bài Speaking này.', 403, 'AUTH_PERM_001');
  }
}

let defaultService;
const getSpeakingSubmissionService = () => {
  if (!defaultService) defaultService = new SpeakingSubmissionService();
  return defaultService;
};

module.exports = {
  SpeakingSubmissionService,
  getSpeakingSubmissionService,
  normalizeUploadInput,
  normalizeParts,
  lockAudioObjects,
};
