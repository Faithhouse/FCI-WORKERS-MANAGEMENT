# Security Specification - Faithhouse Attendance

## Data Invariants
1. A worker must have a unique `qrCodeId`.
2. Attendance records must always be linked to a valid `workerId`.
3. Timestamp of attendance must be the server time.
4. Only signed-in administrators (defined by fixed emails or a specific check) should manage workers.
5. Workers can be "scanned" by an administrator station.

## The "Dirty Dozen" Payloads (Denial Tests)
1. Creating a worker without a name.
2. Creating an attendance record for a non-existent worker.
3. Updating an attendance record's timestamp to the past.
4. Deleting another worker's attendance record.
5. Creating a worker with an injected 1MB string in the name field.
6. Spoofing the `workerId` in an attendance record scan.
7. Changing the `type` of an existing attendance record.
8. Deleting a worker document to orphan attendance records.
9. Reading all workers without being authenticated.
10. Creating a worker with a self-assigned `isAdmin` field if one existed.
11. Bypassing size limits on names.
12. Injected scripts in role descriptions.

## Access Patterns
- **Public**: None.
- **Authenticated (Admin)**: Can create/update/delete workers, read all attendance.
- **Authenticated (Station)**: Can create attendance records.
