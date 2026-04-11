export interface BackendQuestionOption {
  id: string;
  label: string;
  value: string;
  imageUrl?: string | null;
  orderIndex: number;
  isCorrect?: boolean;
}

export interface BackendQuestion {
  id: string;
  type: string;
  text: string;
  imageUrl?: string | null;
  weight: number;
  options: BackendQuestionOption[];
  matchingSchema?: Record<string, string> | null;
  gapSchema?: Record<string, any> | null;
  gradingConfig?: Record<string, any> | null;
}

export interface BackendAttemptQuestion {
  id: string;
  orderIndex: number;
  perQuestionTimeSec?: number | null;
  isTimedOut: boolean;
  question: BackendQuestion;
}

export interface BackendAttempt {
  id: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  totalTimeSec?: number | null;
  testMode?: "TRAINING" | "EXAM";
  allowBackNavigation?: boolean;
  showCorrectAnswersImmediately?: boolean;
  showResultToStudent?: boolean;
  questions: BackendAttemptQuestion[];
}

// For browser-side calls we go through Next.js API routes to attach auth.
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export async function startAttempt(token: string, fullName?: string, group?: string): Promise<BackendAttempt> {
  return request<BackendAttempt>('/api/student/attempts/start', {
    method: 'POST',
    body: JSON.stringify({ token, fullName, group }),
  });
}

export async function getAttempt(attemptId: string): Promise<BackendAttempt> {
  return request<BackendAttempt>(`/api/student/attempts/${attemptId}`);
}

export async function submitAnswers(
  attemptId: string,
  payload: { attemptQuestionId: string; answerPayload: unknown }[],
): Promise<{ ok: boolean }>
{
  return request<{ ok: boolean }>(`/api/student/attempts/${attemptId}/answers`, {
    method: 'POST',
    body: JSON.stringify({ answers: payload }),
  });
}

export async function finishAttempt(attemptId: string, timePerQuestion?: Record<string, number>) {
  return request<unknown>(`/api/student/attempts/${attemptId}/finish`, {
    method: 'POST',
    body: JSON.stringify({ timePerQuestion }),
  });
}

export async function logIntegrityEvent(payload: {
  attemptId: string;
  attemptQuestionId?: string;
  type: 'FULLSCREEN_EXIT' | 'TAB_BLUR' | 'PASTE' | 'SCREENSHOT';
  startedAt: string;
  endedAt?: string;
  metadata?: Record<string, unknown>;
}) {
  return request('/api/student/integrity/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
