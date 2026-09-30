import type { MediaStore } from './types';

const notConfigured = (): Error => new Error('R2 media store is not configured yet');

export const r2Store: MediaStore = {
  async upload() {
    throw notConfigured();
  },
  async signedUrl() {
    throw notConfigured();
  },
  async signedUrls() {
    throw notConfigured();
  },
  async remove() {
    throw notConfigured();
  },
  async discardUploads() {},
};
