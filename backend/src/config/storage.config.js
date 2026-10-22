/**
 * Audio storage and upload token configuration for student speaking recordings and tutor playback
 */

const int = (value, fallback, name) => {
  const parsed = value === undefined ? fallback : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
};

const parseKeyring = (value) => {
  if (!value) return {};
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('AUDIO_UPLOAD_TOKEN_KEYS_JSON must be valid JSON');
  }
  for (const [kid, encoded] of Object.entries(parsed)) {
    if (!kid || Buffer.from(encoded, 'base64').length !== 32) {
      throw new Error('Every audio upload token key must be 32-byte base64');
    }
  }
  return parsed;
};

const loadStorageConfig = (env = process.env) => {
  const production = env.NODE_ENV === 'production';
  const storageProvider = env.OBJECT_STORAGE_PROVIDER || (production ? 's3' : 'supabase');
  const keyring = parseKeyring(env.AUDIO_UPLOAD_TOKEN_KEYS_JSON);
  const activeKid = env.AUDIO_UPLOAD_TOKEN_ACTIVE_KID || null;
  const uploadTokenTtlSeconds = int(env.AUDIO_UPLOAD_TOKEN_TTL_SECONDS, 300, 'AUDIO_UPLOAD_TOKEN_TTL_SECONDS');

  return Object.freeze({
    provider: storageProvider,
    bucket: env.SPEAKING_AUDIO_BUCKET || env.SUPABASE_SPEAKING_BUCKET || 'speaking-audio',
    region: env.AWS_REGION || null,
    endpoint: env.S3_ENDPOINT || null,
    signedUploadTtlSeconds: int(env.AUDIO_SIGNED_UPLOAD_TTL_SECONDS, 300, 'AUDIO_SIGNED_UPLOAD_TTL_SECONDS'),
    signedDownloadTtlSeconds: int(env.AUDIO_SIGNED_DOWNLOAD_TTL_SECONDS, 300, 'AUDIO_SIGNED_DOWNLOAD_TTL_SECONDS'),
    quarantineMinAgeSeconds: int(env.AUDIO_QUARANTINE_MIN_AGE_SECONDS, 86400, 'AUDIO_QUARANTINE_MIN_AGE_SECONDS'),
    cleanupBatchSize: int(env.AUDIO_CLEANUP_BATCH_SIZE, 100, 'AUDIO_CLEANUP_BATCH_SIZE'),
    cleanupIntervalSeconds: int(env.AUDIO_CLEANUP_INTERVAL_SECONDS, 3600, 'AUDIO_CLEANUP_INTERVAL_SECONDS'),
    uploadToken: Object.freeze({
      activeKid,
      keyring: Object.freeze(keyring),
      ttlSeconds: uploadTokenTtlSeconds,
    }),
  });
};

const storageConfig = loadStorageConfig();

module.exports = {
  storageConfig,
  loadStorageConfig,
};
