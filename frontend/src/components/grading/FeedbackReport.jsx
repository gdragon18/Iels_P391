import { useState, useEffect, useCallback } from 'react';
import gradingService from '../../services/grading.service';
import useGradingSocket from '../../hooks/useGradingSocket';
import {
  calculateOverallWritingBand,
  formatBand,
  getScoreBadge,
  getWritingCriterionLabel,
} from './writingFeedback.helpers';

const STATUS_LABELS = {
  graded: 'Đã chấm',
  tutor_graded: 'Đã chấm',
  pending: 'Đang chờ chấm',
};

const badgeToneClasses = {
  good: 'text-success',
  average: 'text-warning-emphasis',
  weak: 'text-danger',
  muted: 'text-secondary',
};

const badgeToneStyles = {
  good: { backgroundColor: '#e9f6df', color: '#2f6b14' },
  average: { backgroundColor: '#fff2dc', color: '#935b00' },
  weak: { backgroundColor: '#ffe8e6', color: '#b42318' },
  muted: { backgroundColor: '#f1f1f1', color: '#666' },
};

const normalizeCriterionValue = (value) => {
  if (value && typeof value === 'object') {
    return value.band ?? value.score ?? value.value ?? null;
  }
  return value ?? null;
};

const getCriterionValue = (scores, key) => {
  if (!scores) return null;
  if (key === 'grammarRangeAccuracy') {
    return normalizeCriterionValue(scores.grammarRangeAccuracy ?? scores.grammaticalRangeAccuracy);
  }
  return normalizeCriterionValue(scores[key]);
};

const getTutorCriterionRows = (tutorGrade, taskNumber) => {
  const scores = tutorGrade?.criterionScores || {};
  return [
    {
      key: 'taskAchievementOrResponse',
      label: getWritingCriterionLabel(taskNumber, 'taskAchievementOrResponse'),
      score: getCriterionValue(scores, 'taskAchievementOrResponse'),
    },
    {
      key: 'coherenceCohesion',
      label: getWritingCriterionLabel(taskNumber, 'coherenceCohesion'),
      score: getCriterionValue(scores, 'coherenceCohesion'),
    },
    {
      key: 'lexicalResource',
      label: getWritingCriterionLabel(taskNumber, 'lexicalResource'),
      score: getCriterionValue(scores, 'lexicalResource'),
    },
    {
      key: 'grammarRangeAccuracy',
      label: getWritingCriterionLabel(taskNumber, 'grammarRangeAccuracy'),
      score: getCriterionValue(scores, 'grammarRangeAccuracy'),
    },
  ];
};

const CriterionScoreCards = ({ rows }) => (
  <div className="row g-3 mb-3">
    {rows.map(row => {
      const badge = getScoreBadge(row.score);
      return (
        <div className="col-sm-6" key={row.key}>
          <div className="border rounded-3 p-3 h-100 bg-white">
            <div className="text-muted fw-medium mb-2">{row.label}</div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="fs-2 fw-bold text-dark">{formatBand(row.score)}</span>
              <span
                className={`badge rounded-pill ${badgeToneClasses[badge.tone] || ''}`}
                style={badgeToneStyles[badge.tone]}
              >
                {badge.label}
              </span>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

const TutorFeedbackBox = ({ tutorGrade, taskNumber }) => {
  if (!tutorGrade) {
    return (
      <div className="alert alert-light border mb-0">
        Chưa có tutor feedback cho task này.
      </div>
    );
  }

  return (
    <div className="card border shadow-none">
      <div className="card-body">
        <div className="d-flex justify-content-between gap-3 flex-wrap mb-3">
          <h5 className="fw-bold mb-0">Tutor feedback</h5>
          <span className="badge bg-dark rounded-pill">Band {formatBand(tutorGrade.overallBand)}</span>
        </div>
        <CriterionScoreCards rows={getTutorCriterionRows(tutorGrade, taskNumber)} />
        <p className="mb-0" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
          {tutorGrade.writtenFeedback || 'Không có nhận xét.'}
        </p>
      </div>
    </div>
  );
};

const getTaskBandForSource = (task) => {
  return task?.tutorGrade?.overallBand
    ?? task?.tutorGrade?.bandScore
    ?? task?.tutorGrade?.band_score
    ?? null;
};

const OverallWritingBandCard = ({ tasks, source }) => {
  const task1 = tasks.find(task => Number(task.taskNumber) === 1);
  const task2 = tasks.find(task => Number(task.taskNumber) === 2);
  const task1Band = getTaskBandForSource(task1, source);
  const task2Band = getTaskBandForSource(task2, source);
  const overall = calculateOverallWritingBand(task1Band, task2Band);
  const badge = getScoreBadge(overall);

  return (
    <div className="card border shadow-none mt-4">
      <div className="card-body p-4">
        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
          <div>
            <h4 className="fw-bold mb-1">Overall Writing Band</h4>
            <p className="text-muted mb-0">
              Task 1 × 33% + Task 2 × 67% — chuẩn IELTS Academic
            </p>
          </div>
          {overall !== null && (
            <div className="d-flex align-items-center gap-3">
              <span className="display-5 fw-bold text-dark mb-0">{formatBand(overall)}</span>
              <span
                className={`badge rounded-pill px-3 py-2 ${badgeToneClasses[badge.tone] || ''}`}
                style={badgeToneStyles[badge.tone]}
              >
                {badge.label}
              </span>
            </div>
          )}
        </div>

        {overall === null ? (
          <div className="alert alert-light border mt-3 mb-0">
            Chưa đủ dữ liệu để tính Overall Writing Band.
          </div>
        ) : (
          <div className="mt-3 border-top">
            <div className="d-flex justify-content-between py-3 border-bottom">
              <span>Task 1 <span className="text-muted fw-semibold">(trọng số 33%)</span></span>
              <span className="fw-bold">{formatBand(task1Band)}</span>
            </div>
            <div className="d-flex justify-content-between pt-3">
              <span>Task 2 <span className="text-muted fw-semibold">(trọng số 67%)</span></span>
              <span className="fw-bold">{formatBand(task2Band)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const getSpeakingCriterionRows = (aiFeedback) => {
  const scores = aiFeedback?.criterionScores || {};
  return [
    {
      key: 'fluencyCoherence',
      label: 'Fluency & Coherence',
      score: getCriterionValue(scores, 'fluencyCoherence'),
    },
    {
      key: 'lexicalResource',
      label: 'Lexical Resource',
      score: getCriterionValue(scores, 'lexicalResource'),
    },
    {
      key: 'pronunciation',
      label: 'Pronunciation',
      score: getCriterionValue(scores, 'pronunciation'),
    },
    {
      key: 'grammaticalRangeAccuracy',
      label: 'Grammatical Range & Accuracy',
      score: getCriterionValue(scores, 'grammaticalRangeAccuracy'),
    },
  ];
};

const classifyAudioError = (error) => {
  const status = Number(error?.response?.status || 0);
  const code = error?.response?.data?.error?.code || error?.response?.data?.error?.errorCode || '';
  if ([401, 403].includes(status) || code === 'AUTH_PERM_001') {
    return { code: 'AUDIO_FORBIDDEN', message: 'Bạn không có quyền nghe audio của Part này.' };
  }
  if (status === 404 || code === 'AUDIO_NOT_FOUND') {
    return { code: 'AUDIO_MISSING', message: 'Không tìm thấy bản ghi âm của Part này.' };
  }
  if (status >= 500 || /STORAGE|SIGNED/i.test(code)) {
    return { code: 'AUDIO_STORAGE_TEMPORARY', message: 'Dịch vụ lưu trữ audio tạm thời không khả dụng.' };
  }
  return { code: 'AUDIO_SIGNING_FAILED', message: 'Không thể tạo liên kết nghe audio an toàn.' };
};

const loadSignedAudioPart = async (part) => {
  if (!part?.submissionId) {
    return { ...part, audioUrl: '', audioState: 'missing', audioError: {
      code: 'AUDIO_MISSING', message: 'Không có bản ghi âm cho Part này.',
    } };
  }
  try {
    const audioResponse = await gradingService.getAudioUrl(part.submissionId, 'speaking');
    const url = audioResponse.data?.url || '';
    if (!url) {
      return { ...part, audioUrl: '', audioState: 'missing', audioError: {
        code: 'AUDIO_MISSING', message: 'Không tìm thấy bản ghi âm của Part này.',
      } };
    }
    return { ...part, audioUrl: url, audioState: 'ready', audioError: null };
  } catch (error) {
    return { ...part, audioUrl: '', audioState: 'error', audioError: classifyAudioError(error) };
  }
};

const SpeakingPartCard = ({ part, onRetryAudio, onAudioPlaybackError }) => {
  const transcript = part.transcript || '';
  return (
  <div className="card border shadow-none mb-3">
    <div className="card-header bg-white fw-bold">Part {part.partNumber}</div>
    <div className="card-body">
      <div className="mb-3">
        <div className="fw-semibold mb-2">Đề bài</div>
        <p className="mb-0" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
          {part.prompt || 'Không có đề bài.'}
        </p>
      </div>
      {part.audioState === 'loading' && (
        <div className="text-muted mb-3" role="status">Đang tạo liên kết audio an toàn...</div>
      )}
      {part.audioUrl && (
        <div className="mb-3">
          <div className="fw-semibold mb-2">Bản ghi âm</div>
          <audio
            controls
            src={part.audioUrl}
            className="w-100"
            onError={() => onAudioPlaybackError?.(part)}
          />
        </div>
      )}
      {part.audioError && (
        <div className="alert alert-warning py-2" role="alert">
          <div>{part.audioError.message}</div>
          {onRetryAudio && (
            <button
              type="button"
              className="btn btn-sm btn-outline-dark mt-2"
              disabled={part.audioState === 'loading'}
              onClick={() => onRetryAudio(part)}
            >
              Thử tải lại audio Part {part.partNumber}
            </button>
          )}
        </div>
      )}
      {transcript && (
        <div className="mb-3">
          <div className="fw-semibold mb-2">Script / transcript</div>
          <p className="mb-0 bg-light rounded-3 p-3" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
            {transcript}
          </p>
        </div>
      )}
    </div>
  </div>
  );
};

export const SpeakingFeedbackDetail = ({
  data,
  onRetryAudio,
  onAudioPlaybackError,
}) => {
  const tutorGrade = data.tutorGrade || data.tutor_report;
  const isGraded = Boolean(tutorGrade || data.tutorStatus === 'graded');
  const overall = tutorGrade?.overallBand ?? tutorGrade?.band_score ?? tutorGrade?.bandScore ?? null;
  const badge = getScoreBadge(overall);

  return (
    <div className="feedback-report mt-4" style={{ fontFamily: 'UberMoveText, system-ui, sans-serif' }}>
      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
        <div>
          <h3 className="fw-bold mb-1">Speaking Feedback Detail</h3>
          <p className="text-muted mb-0">{data.testTitle || 'IELTS Speaking'}</p>
        </div>
        <span className="badge text-bg-light border">
          Tutor: {isGraded ? 'Đã chấm' : 'Đang chờ chấm'}
        </span>
      </div>

      {!isGraded && (
        <div className="alert alert-info border" role="status">
          Bài làm đã được nộp cho giáo viên. Kết quả chấm điểm và nhận xét sẽ được cập nhật khi giáo viên hoàn thành.
        </div>
      )}

      {isGraded && (
        <div className="card border shadow-none mb-4">
          <div className="card-body p-4">
            <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
              <div>
                <h4 className="fw-bold mb-1">Overall Speaking Band</h4>
                <p className="text-muted mb-0">Điểm đánh giá từ Giáo viên (Tutor)</p>
              </div>
              {overall !== null && (
                <div className="d-flex align-items-center gap-3">
                  <span className="display-5 fw-bold text-dark mb-0">{formatBand(overall)}</span>
                  <span
                    className={`badge rounded-pill px-3 py-2 ${badgeToneClasses[badge.tone] || ''}`}
                    style={badgeToneStyles[badge.tone]}
                  >
                    {badge.label}
                  </span>
                </div>
              )}
            </div>
            {tutorGrade && <CriterionScoreCards rows={getSpeakingCriterionRows(tutorGrade)} />}
            {tutorGrade?.writtenFeedback && (
              <p className="mb-0" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                {tutorGrade.writtenFeedback}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="row g-4">
        <div className="col-12">
          <h5 className="fw-bold mb-3">Các phần ghi âm (Parts)</h5>
          {(data.parts || []).map(part => (
            <SpeakingPartCard
              key={part.submissionId || part.partNumber}
              part={part}
              onRetryAudio={onRetryAudio}
              onAudioPlaybackError={onAudioPlaybackError}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export const WritingFeedbackDetail = ({
  data,
}) => {
  const [activeTaskNumber, setActiveTaskNumber] = useState(1);
  const tasks = data.tasks || [];
  const activeTask = tasks.find(task => task.taskNumber === activeTaskNumber) || tasks[0];
  const isTutorGraded = data.tutorStatus === 'graded';

  if (!activeTask) {
    return <div className="alert alert-info">Chưa có dữ liệu Writing task.</div>;
  }

  return (
    <div className="feedback-report mt-4" style={{ fontFamily: 'UberMoveText, system-ui, sans-serif' }}>
      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
        <div>
          <h3 className="fw-bold mb-1">Writing Feedback Detail</h3>
          <p className="text-muted mb-0">{data.testTitle || 'IELTS Writing'}</p>
        </div>
        <div className="d-flex gap-2 flex-wrap justify-content-end">
          <span className="badge text-bg-light border">
            Tutor: {isTutorGraded ? 'Đã chấm' : 'Đang chờ chấm'}
          </span>
        </div>
      </div>

      <ul className="nav nav-tabs mb-4">
        {[1, 2].map(taskNumber => (
          <li className="nav-item" key={taskNumber}>
            <button
              type="button"
              className={`nav-link ${activeTaskNumber === taskNumber ? 'active' : ''}`}
              onClick={() => setActiveTaskNumber(taskNumber)}
            >
              Task {taskNumber}
            </button>
          </li>
        ))}
      </ul>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card border shadow-none mb-4">
            <div className="card-header bg-white fw-bold">Prompt</div>
            <div className="card-body">
              <p className="mb-0" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                {activeTask.prompt || 'Không có đề bài.'}
              </p>
            </div>
          </div>
          <div className="card border shadow-none">
            <div className="card-header bg-white d-flex justify-content-between">
              <span className="fw-bold">Student response</span>
              <span className="text-muted small">{activeTask.wordCount || 0} words</span>
            </div>
            <div className="card-body">
              <p className="mb-0" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                {activeTask.studentResponse || 'Không có bài làm.'}
              </p>
            </div>
          </div>
        </div>
        <div className="col-lg-7">
          <TutorFeedbackBox
            tutorGrade={activeTask.tutorGrade}
            taskNumber={activeTask.taskNumber}
          />
        </div>
      </div>

      <OverallWritingBandCard tasks={tasks} source="tutor" />
    </div>
  );
};

const FeedbackReport = ({ submissionId, type }) => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { socket } = useGradingSocket();

  const fetchFeedback = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await gradingService.getFeedback(submissionId, type);
      if (response.success) {
        let nextData = response.data;
        if (type === 'speaking' && Array.isArray(nextData?.parts)) {
          const parts = await Promise.all(nextData.parts.map(loadSignedAudioPart));
          nextData = { ...nextData, parts };
        }
        setReportData(nextData);
      } else {
        setError(response.error?.message || 'Có lỗi xảy ra khi tải điểm.');
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Không thể kết nối đến server.');
    } finally {
      setLoading(false);
    }
  }, [submissionId, type]);

  const updateSpeakingPart = useCallback((submissionPartId, updater) => {
    setReportData((current) => current ? {
      ...current,
      parts: (current.parts || []).map((part) => (
        part.submissionId === submissionPartId ? updater(part) : part
      )),
    } : current);
  }, []);

  const retrySpeakingAudio = useCallback(async (part) => {
    updateSpeakingPart(part.submissionId, (current) => ({
      ...current, audioUrl: '', audioState: 'loading', audioError: null,
    }));
    const refreshed = await loadSignedAudioPart(part);
    updateSpeakingPart(part.submissionId, () => refreshed);
  }, [updateSpeakingPart]);

  const markSpeakingAudioExpired = useCallback((part) => {
    updateSpeakingPart(part.submissionId, (current) => ({
      ...current,
      audioUrl: '',
      audioState: 'error',
      audioError: {
        code: 'SIGNED_AUDIO_EXPIRED',
        message: 'Liên kết audio đã hết hạn hoặc không còn hợp lệ. Hãy tải lại liên kết.',
      },
    }));
  }, [updateSpeakingPart]);

  useEffect(() => {
    if (submissionId) {
      const timer = window.setTimeout(fetchFeedback, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [fetchFeedback, submissionId]);

  useEffect(() => {
    if (!socket) return;

    const handleGradingComplete = (data) => {
      const eventSubmissionId = data.submission_id || data.submissionId;
      if (eventSubmissionId === submissionId) {
        fetchFeedback();
      }
    };

    socket.on('grading_complete', handleGradingComplete);

    return () => {
      socket.off('grading_complete', handleGradingComplete);
    };
  }, [socket, submissionId, fetchFeedback]);

  // Polling fallback while waiting for tutor
  useEffect(() => {
    const isPending = reportData && reportData.tutorStatus !== 'graded' && !reportData.tutor_report;
    if (isPending) {
      const interval = setInterval(() => {
        fetchFeedback();
      }, 15000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [reportData, fetchFeedback]);

  if (loading && !reportData) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center py-5">
        <div className="spinner-border text-primary mb-3" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="text-muted fw-bold">Đang tải dữ liệu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger" role="alert">
        <h4 className="alert-heading">Lỗi!</h4>
        <p>{error}</p>
        <button className="btn btn-outline-danger mt-2" onClick={fetchFeedback}>Thử lại</button>
      </div>
    );
  }

  if (type === 'writing' && Array.isArray(reportData?.tasks)) {
    return (
      <WritingFeedbackDetail
        data={reportData}
      />
    );
  }

  if (type === 'speaking' && Array.isArray(reportData?.parts)) {
    return (
      <SpeakingFeedbackDetail
        data={reportData}
        onRetryAudio={retrySpeakingAudio}
        onAudioPlaybackError={markSpeakingAudioExpired}
      />
    );
  }

  if (!reportData || !reportData.tutor_report) {
    return (
      <div className="alert alert-info" role="alert">
        <p className="mb-0">Chưa có kết quả chấm điểm cho bài làm này.</p>
      </div>
    );
  }

  const report = reportData.tutor_report;
  const isTutor = true;

  const formatScore = (score) => {
    if (score === null || score === undefined) return 'N/A';
    const num = parseFloat(score);
    return isNaN(num) ? 'N/A' : num.toFixed(1);
  };

  // UI/UX Minimalist Black & White Theme (Uber-like)
  return (
    <div className="feedback-report mt-4" style={{ fontFamily: 'UberMoveText, system-ui, sans-serif' }}>
      {/* Nổi bật Điểm Overall */}
      <div className="card shadow-none border mb-4 rounded-4" style={{ borderColor: '#e2e2e2' }}>
        <div className="card-body text-center py-5 bg-white rounded-4">
          <h2 className="text-uppercase fw-bold text-dark mb-2" style={{ fontSize: '16px', letterSpacing: '1px' }}>Overall Band Score</h2>
          <div className="display-1 fw-bold text-dark mb-4" style={{ fontFamily: 'UberMove, system-ui, sans-serif', fontSize: '80px' }}>
            {formatScore(report.band_score)}
          </div>
          <span className="badge bg-dark text-white rounded-pill fs-6 px-4 py-2 fw-medium">
            Graded by {isTutor ? 'Tutor' : 'AI'}
          </span>
        </div>
      </div>

      {/* 4 tiêu chí thành phần hiển thị dạng Grid */}
      <div className="row g-4 mb-4">
        {type === 'writing' ? (
          <>
            <div className="col-6 col-lg-3">
              <div className="card h-100 border shadow-none rounded-4" style={{ borderColor: '#e2e2e2', backgroundColor: '#fdfdfd' }}>
                <div className="card-body p-3 p-lg-4 text-center">
                  <h6 className="card-title text-muted fw-medium mb-2 mb-lg-3" style={{ fontSize: '13px' }}>Task Achievement / Response</h6>
                  <h3 className="card-text fw-bold text-dark mb-0" style={{ fontFamily: 'UberMove, system-ui, sans-serif', fontSize: '28px' }}>{formatScore(report.task_achievement_score || report.task_response_score)}</h3>
                </div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <div className="card h-100 border shadow-none rounded-4" style={{ borderColor: '#e2e2e2', backgroundColor: '#fdfdfd' }}>
                <div className="card-body p-3 p-lg-4 text-center">
                  <h6 className="card-title text-muted fw-medium mb-2 mb-lg-3" style={{ fontSize: '13px' }}>Coherence & Cohesion</h6>
                  <h3 className="card-text fw-bold text-dark mb-0" style={{ fontFamily: 'UberMove, system-ui, sans-serif', fontSize: '28px' }}>{formatScore(report.coherence_score)}</h3>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="col-6 col-lg-3">
              <div className="card h-100 border shadow-none rounded-4" style={{ borderColor: '#e2e2e2', backgroundColor: '#fdfdfd' }}>
                <div className="card-body p-3 p-lg-4 text-center">
                  <h6 className="card-title text-muted fw-medium mb-2 mb-lg-3" style={{ fontSize: '13px' }}>Fluency & Coherence</h6>
                  <h3 className="card-text fw-bold text-dark mb-0" style={{ fontFamily: 'UberMove, system-ui, sans-serif', fontSize: '28px' }}>{formatScore(report.fluency_score)}</h3>
                </div>
              </div>
            </div>
            <div className="col-6 col-lg-3">
              <div className="card h-100 border shadow-none rounded-4" style={{ borderColor: '#e2e2e2', backgroundColor: '#fdfdfd' }}>
                <div className="card-body p-3 p-lg-4 text-center">
                  <h6 className="card-title text-muted fw-medium mb-2 mb-lg-3" style={{ fontSize: '13px' }}>Pronunciation</h6>
                  <h3 className="card-text fw-bold text-dark mb-0" style={{ fontFamily: 'UberMove, system-ui, sans-serif', fontSize: '28px' }}>{formatScore(report.pronunciation_score)}</h3>
                </div>
              </div>
            </div>
          </>
        )}
        <div className="col-6 col-lg-3">
          <div className="card h-100 border shadow-none rounded-4" style={{ borderColor: '#e2e2e2', backgroundColor: '#fdfdfd' }}>
            <div className="card-body p-3 p-lg-4 text-center">
              <h6 className="card-title text-muted fw-medium mb-2 mb-lg-3" style={{ fontSize: '13px' }}>Lexical Resource</h6>
              <h3 className="card-text fw-bold text-dark mb-0" style={{ fontFamily: 'UberMove, system-ui, sans-serif', fontSize: '28px' }}>{formatScore(report.lexical_score)}</h3>
            </div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="card h-100 border shadow-none rounded-4" style={{ borderColor: '#e2e2e2', backgroundColor: '#fdfdfd' }}>
            <div className="card-body p-3 p-lg-4 text-center">
              <h6 className="card-title text-muted fw-medium mb-2 mb-lg-3" style={{ fontSize: '13px' }}>Grammatical Range & Accuracy</h6>
              <h3 className="card-text fw-bold text-dark mb-0" style={{ fontFamily: 'UberMove, system-ui, sans-serif', fontSize: '28px' }}>{formatScore(report.grammar_score)}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Error Highlights */}
      {report.error_highlights && report.error_highlights.length > 0 && (
        <div className="card shadow-none mb-4 rounded-4 border" style={{ borderColor: '#e2e2e2' }}>
          <div className="card-header bg-dark text-white rounded-top-4 py-3 border-0">
            <h5 className="mb-0 fw-bold" style={{ fontFamily: 'UberMove, system-ui, sans-serif' }}><i className="bi bi-exclamation-triangle-fill me-2 text-warning"></i>Error Highlights</h5>
          </div>
          <div className="card-body p-0">
            <ul className="list-group list-group-flush rounded-bottom-4">
              {report.error_highlights.map((err, idx) => (
                <li key={idx} className="list-group-item px-4 py-4 border-bottom" style={{ borderColor: '#e2e2e2' }}>
                  <div className="mb-2">
                    <span className="badge bg-secondary rounded-pill px-3 py-1 fw-medium">{err.type || 'Error'}</span>
                  </div>
                  <div className="fst-italic text-muted mb-2 text-decoration-line-through" style={{ fontSize: '15px' }}>"{err.text}"</div>
                  <div className="fw-bold text-dark" style={{ fontSize: '15px' }}>&rarr; {err.suggestion}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Feedback chi tiết */}
      <div className="card shadow-none rounded-4 border" style={{ borderColor: '#e2e2e2' }}>
        <div className="card-header bg-white border-bottom py-3 rounded-top-4" style={{ borderColor: '#e2e2e2' }}>
          <h5 className="mb-0 fw-bold text-dark" style={{ fontFamily: 'UberMove, system-ui, sans-serif' }}>Detailed Feedback</h5>
        </div>
        <div className="card-body p-4 bg-white rounded-bottom-4" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', fontSize: '15px' }}>
          {report.written_feedback || report.feedback_text || 'Không có nhận xét chi tiết.'}
        </div>
      </div>
    </div>
  );
};

export default FeedbackReport;
