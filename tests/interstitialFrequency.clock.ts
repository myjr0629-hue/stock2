// Must run before the manager singleton captures its cold-start timestamp.
import { advance } from '../scripts/test-fullscreen-ads.shim';
advance(new Date(2026, 9, 20, 12).getTime() - Date.now());
