import { buildIfStale } from './launch.js';

export default function globalSetup(): void {
  buildIfStale();
}
