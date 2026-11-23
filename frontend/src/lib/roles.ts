// Readable names for the role codes used by the server
export const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Student',
  FACULTY: 'Faculty',
  PM: 'Program Manager',
  HOD: 'Head of Department',
  DEAN: 'Dean',
  ADMIN: 'Administrator',
};

export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role;

// "Dr. Mohammad Shahzad Haroon" -> "MH"
export function initialsOf(name: string): string {
  return name
    .replace(/^((Prof|Dr|Mr|Ms|Sir|Engr)\.?\s+)+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i, all) => (i === 0 || i === all.length - 1 ? p.charAt(0).toUpperCase() : ''))
    .join('');
}
