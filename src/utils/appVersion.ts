/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

declare const __APP_VERSION__: string;
declare const __APP_BUILD_TIME__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'V1.0';

export const APP_BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';
