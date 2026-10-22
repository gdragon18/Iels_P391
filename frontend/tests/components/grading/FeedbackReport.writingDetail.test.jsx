/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackReport from '../../../src/components/grading/FeedbackReport';
import gradingService from '../../../src/services/grading.service';
import useGradingSocket from '../../../src/hooks/useGradingSocket';

vi.mock('../../../src/services/grading.service');
vi.mock('../../../src/hooks/useGradingSocket');

const tutorTask = (taskNumber, overallBand, firstCriterionBand) => ({
  taskNumber,
  prompt: `Prompt ${taskNumber}`,
  studentResponse: `Student response ${taskNumber}`,
  wordCount: taskNumber === 1 ? 226 : 358,
  tutorGrade: {
    overallBand,
    criterionScores: {
      taskAchievementOrResponse: firstCriterionBand,
      coherenceCohesion: 7.0,
      lexicalResource: 6.5,
      grammarRangeAccuracy: 6.0,
    },
    writtenFeedback: `Tutor feedback task ${taskNumber}`,
  },
});

describe('FeedbackReport Writing detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGradingSocket.mockReturnValue({ socket: null });
  });

  it('renders tutor feedback and overall writing band', async () => {
    gradingService.getFeedback.mockResolvedValue({
      success: true,
      data: {
        submissionId: 'group-1',
        testTitle: 'IELTS Writing',
        skill: 'writing',
        grader: 'tutor',
        tutorStatus: 'graded',
        tasks: [
          tutorTask(1, 6.5, 6.0),
          tutorTask(2, 7.5, 7.0),
        ],
      },
    });

    render(<FeedbackReport submissionId="group-1" type="writing" />);

    await waitFor(() => {
      expect(screen.getByText('Tutor feedback task 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Task Achievement')).toBeInTheDocument();
    expect(screen.getByText('Overall Writing Band')).toBeInTheDocument();
    expect(screen.getByText('Task 1 × 33% + Task 2 × 67% — chuẩn IELTS Academic')).toBeInTheDocument();
    expect(screen.getByText('7.0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Task 2' }));

    expect(screen.getByText('Task Response')).toBeInTheDocument();
  });
});
