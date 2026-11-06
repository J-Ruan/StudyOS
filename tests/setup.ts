import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

import { Blob } from 'node:buffer';
import { vi } from 'vitest';
// Node structuredClone used by fake-indexeddb supports native Blobs.
vi.stubGlobal('Blob', Blob);
