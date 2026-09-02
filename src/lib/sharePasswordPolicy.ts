export const SHARE_PASSWORD_MIN_LENGTH = 6;
export const SHARE_PASSWORD_MAX_LENGTH = 128;

export function validateSharePassword(password: string) {
  if (password.length < SHARE_PASSWORD_MIN_LENGTH) return "Mật khẩu phải có ít nhất 6 ký tự.";
  if (password.length > SHARE_PASSWORD_MAX_LENGTH) return "Mật khẩu không được dài quá 128 ký tự.";
  return null;
}

export function shareAccessMatches(proof: { shareId: number; passwordVersion: number } | null, share: { id: number; passwordVersion: number }) {
  return proof?.shareId === share.id && proof.passwordVersion === share.passwordVersion;
}
