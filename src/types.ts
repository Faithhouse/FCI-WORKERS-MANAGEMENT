export interface Worker {
  id: string;
  name: string;
  email: string;
  role: string;
  qrCodeId: string;
  createdAt: any;
}

export interface AttendanceRecord {
  id: string;
  workerId: string;
  workerName: string;
  timestamp: any;
  type: 'clock-in' | 'clock-out';
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}
