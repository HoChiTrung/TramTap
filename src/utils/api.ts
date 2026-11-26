/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolves the backend API base URL:
 * - Uses VITE_API_BASE_URL when explicitly provided at build time.
 * - Defaults to same-origin ('') on Vercel (FE + API unified) and localhost.
 */
export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  return '';
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}
