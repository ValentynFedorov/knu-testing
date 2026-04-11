// Core TypeScript entities & enums for KNU testing platform

export enum UserRole {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
}

export enum TestMode {
  TRAINING = 'TRAINING',
  EXAM = 'EXAM',
}

export enum QuestionType {
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  OPEN_TEXT = 'OPEN_TEXT',
  MATCHING = 'MATCHING',
  GAP_TEXT = 'GAP_TEXT',
}

export enum TestRunStatus {
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

export enum AttemptStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  FORCED_SUBMIT = 'FORCED_SUBMIT',
  TIMEOUT = 'TIMEOUT',
}

export enum IntegrityEventType {
  FULLSCREEN_EXIT = 'FULLSCREEN_EXIT',
  TAB_BLUR = 'TAB_BLUR',
  PASTE = 'PASTE',
  SCREENSHOT = 'SCREENSHOT',
  PHONE_DETECTED = 'PHONE_DETECTED',
  SUSPICIOUS_SPEECH = 'SUSPICIOUS_SPEECH',
}
