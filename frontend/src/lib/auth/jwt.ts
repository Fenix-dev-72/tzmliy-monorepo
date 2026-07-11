/**
 * Decodes a JWT's payload without verifying its signature -- fine for
 * client-side UI gating (e.g. which nav items to render) since the backend
 * is the actual authority via `require_permission`; a forged claim here
 * can't grant real access, only hide/show links.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    const json = decodeURIComponent(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export function getPermissionsFromAccessToken(token: string): string[] {
  const claims = decodeJwtPayload(token);
  return Array.isArray(claims.permissions) ? (claims.permissions as string[]) : [];
}
