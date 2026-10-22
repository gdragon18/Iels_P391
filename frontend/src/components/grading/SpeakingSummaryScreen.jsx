import { useCallback, useEffect, useRef, useState } from 'react';

const useSpeakingSubmission = ({ answers, grader, onSubmit }) => {
  const [autoSubmitTime, setAutoSubmitTime] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const autoSubmitAttemptedRef = useRef(false);
  const isComplete = [1, 2, 3].every((part) => (
    answers.some((answer) => answer.part_number === part && answer.upload_token)
  ));

  const submit = useCallback(async () => {
    if (isSubmitting || !isComplete) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(grader);
    } catch (error) {
      setSubmitError(error.response?.data?.error?.message || error.message || 'Nộp bài thất bại.');
      setIsSubmitting(false);
    }
  }, [grader, isComplete, isSubmitting, onSubmit]);

  useEffect(() => {
    if (isSubmitting || autoSubmitAttemptedRef.current) return undefined;
    const timer = window.setInterval(() => {
      setAutoSubmitTime((previous) => {
        if (previous > 1) return previous - 1;
        window.clearInterval(timer);
        autoSubmitAttemptedRef.current = true;
        if (isComplete) void submit();
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isComplete, isSubmitting, submit]);

  return { autoSubmitTime, isComplete, isSubmitting, submit, submitError };
};

const PartStatusList = ({ answers, parts }) => (
  <div className="bg-light rounded-4 p-4 mb-5">
    <h5 className="fw-bold mb-3 border-bottom pb-2">Trạng thái bài làm</h5>
    <ul className="list-unstyled mb-0">
      {parts.map((part, index) => {
        const partNumber = index + 1;
        const isDone = answers.some((answer) => (
          answer.part_number === partNumber && answer.upload_token
        ));
        return (
          <li key={part.id ?? partNumber} className="d-flex align-items-center mb-2 fs-5">
            <i className={`bi ${isDone ? 'bi-check-circle-fill text-success' : 'bi-x-circle-fill text-danger'} me-3`} />
            Part {partNumber}: {isDone ? 'Đã hoàn thành' : 'Bỏ qua / Trống'}
          </li>
        );
      })}
    </ul>
  </div>
);

const SubmissionNotice = () => (
  <div className="alert alert-info border-0 rounded-3 mb-4 d-flex align-items-center">
    <i className="bi bi-person-video3 fs-4 me-3 text-primary" />
    <div>
      <div className="fw-bold">Nộp bài cho Giáo viên chấm điểm (Tutor)</div>
      <div className="small text-muted">Bài làm sẽ được chuyển tới hàng đợi của giáo viên để nghe và chấm nhận xét chi tiết.</div>
    </div>
  </div>
);

const SubmitControls = ({ autoSubmitTime, isComplete, isSubmitting, submit, submitError }) => (
  <div className="text-center mt-5">
    {!isComplete && (
      <div className="alert alert-danger">Chưa upload đủ ba Part; hệ thống sẽ không tự động nộp.</div>
    )}
    {submitError && <div className="alert alert-danger">{submitError}</div>}
    <p className="text-danger fw-bold mb-3">Tự động nộp bài sau {autoSubmitTime} giây...</p>
    <button
      type="button"
      className="btn btn-primary rounded-pill px-5 py-3 fs-5 fw-bold w-100 shadow"
      style={{ maxWidth: '400px' }}
      onClick={submit}
      disabled={isSubmitting || !isComplete}
    >
      {isSubmitting ? (
        <><span className="spinner-border spinner-border-sm me-2" />Đang nộp bài...</>
      ) : 'Nộp bài Speaking'}
    </button>
  </div>
);

const SpeakingSummaryScreen = ({ exam, answers, onSubmit }) => {
  const submission = useSpeakingSubmission({ answers, grader: 'tutor', onSubmit });

  return (
    <div className="container py-5 mt-4" style={{ maxWidth: '800px' }}>
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
        <div className="card-header bg-success text-white p-4 text-center">
          <i className="bi bi-check-circle-fill display-4 mb-3 d-block" />
          <h2 className="fw-bold mb-0" style={{ fontFamily: 'UberMove, system-ui, sans-serif' }}>
            Đã hoàn thành bài ghi âm
          </h2>
        </div>
        <div className="card-body p-4 p-md-5">
          <p className="text-center text-muted mb-4 fs-5">
            Bài làm của bạn đã được ghi âm và lưu trữ thành công.
          </p>
          <PartStatusList answers={answers} parts={exam.parts} />
          <SubmissionNotice />
          <SubmitControls {...submission} />
        </div>
      </div>
    </div>
  );
};

export default SpeakingSummaryScreen;
