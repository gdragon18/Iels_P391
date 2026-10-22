const express = require('express');
const router = express.Router();

const SubmissionController = require('../../../controllers/submission.controller');
const authenticate = require('../../../middleware/authenticate');
const authorizeFactory = require('../../../middleware/authorize');
const AppError = require('../../../utils/AppError');
const uploadMiddleware = require('../../../middleware/upload.middleware');

const authorize = authorizeFactory(AppError);

// Apply auth middleware to all submission routes
router.use(authenticate);

// Submit a writing task response
router.post('/writing', authorize(['student']), SubmissionController.submitWriting);

// Submit full writing test
router.post('/writing/full', authorize(['student']), SubmissionController.submitFullWriting);

// Upload audio temp (speaking)
router.post('/speaking/audio-uploads', authorize(['student']), SubmissionController.createAudioUpload);

router.get('/:id/audio-url', authorize(['student', 'tutor', 'admin']), SubmissionController.getAudioUrl);

// Legacy multipart upload, retained only for tutor compatibility.
router.post(
  '/speaking/upload',
  authorize(['student']),
  uploadMiddleware,
  SubmissionController.uploadSpeakingAudio
);

// Submit full speaking test (must be BEFORE generic /speaking to avoid Express match issue)
router.post('/speaking/full', authorize(['student']), SubmissionController.submitFullSpeaking);

// Submit speaking (legacy - per part, deprecated)
router.post(
  '/speaking',
  authorize(['student']),
  SubmissionController.submitSpeaking
);

// Get submission history for a student
router.get('/history', SubmissionController.getHistory);

// Get feedback for a submission
router.get('/:id/feedback', SubmissionController.getFeedback);

// Route for submitting a test (Listening / Reading)
router.post('/:testId', SubmissionController.submitTest);

// Route for fetching submission result
router.get('/:attemptId', SubmissionController.getSubmissionResult);

module.exports = router;
