/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const DEFAULT_PRODUCTION_API_URL = 'https://tramtap.onrender.com';

/**
 * Resolves the backend API base URL:
 * - Uses VITE_API_BASE_URL when explicitly provided at build time.
 * - Automatically routes to https://tramtap.onrender.com when hosted on GitHub Pages (*.github.io).
 * - Uses same-origin ('') on localhost, AI Studio preview, or when opened directly on tramtap.onrender.com.
 */
export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.endsWith('.github.io')) {
      return DEFAULT_PRODUCTION_API_URL;
    }
  }

  return '';
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}
