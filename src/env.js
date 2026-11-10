import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const IMG_DIR = path.join(PUBLIC_DIR, 'img');

dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

export function env(nombre, porDefecto = '') {
  const valor = process.env[nombre];
  return valor === undefined || valor === '' ? porDefecto : String(valor);
}

export function envBool(nombre, porDefecto = false) {
  const valor = env(nombre, porDefecto ? '1' : '0').toLowerCase();
  return valor === '1' || valor === 'true' || valor === 'yes' || valor === 'on';
}

export const APP_ENV = env('APP_ENV', 'local');
export const APP_DEBUG = envBool('APP_DEBUG', APP_ENV !== 'production');
export const PORT = Number(env('PORT', '3000'));
export const SESSION_SECRET = env('SESSION_SECRET', 'tia-oleo4-dev-secret-change-me');
export const SESSION_NAME = env('SESSION_NAME', 'tiaoleo_sess');
export const SESSION_SECURE = envBool(
  'SESSION_SECURE',
  APP_ENV === 'production'
);
export const SESSION_MAX_AGE = Number(env('SESSION_MAX_AGE', String(60 * 60 * 24))) * 1000;
