import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseEvidenceStorage } from './supabase-evidence-storage';

describe('SupabaseEvidenceStorage', () => {
  const config = new ConfigService({ SUPABASE_STORAGE_BUCKET: 'evidence' });

  it('writes, inspects, reads and deletes a private object through the selected bucket', async () => {
    const upload = jest.fn().mockResolvedValue({ data: {}, error: null });
    const info = jest.fn().mockResolvedValue({
      data: { contentType: 'image/png', size: 4 },
      error: null,
    });
    const download = jest.fn().mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3, 4])]),
      error: null,
    });
    const remove = jest.fn().mockResolvedValue({ data: [], error: null });
    const from = jest.fn().mockReturnValue({ upload, info, download, remove });
    const storage = new SupabaseEvidenceStorage(config, {
      storage: { from },
    } as unknown as SupabaseClient);

    await storage.putObject('org/order/evidence', Buffer.from([1, 2, 3, 4]), {
      contentType: 'image/png',
      sizeBytes: 4,
    });

    await expect(storage.statObject('org/order/evidence')).resolves.toEqual({
      contentType: 'image/png',
      sizeBytes: 4,
    });
    await expect(storage.readObject('org/order/evidence')).resolves.toEqual(
      Buffer.from([1, 2, 3, 4]),
    );
    await expect(
      storage.deleteObject('org/order/evidence'),
    ).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledTimes(4);
    expect(from).toHaveBeenCalledWith('evidence');
    expect(upload).toHaveBeenCalledWith(
      'org/order/evidence',
      expect.any(Buffer),
      expect.objectContaining({
        cacheControl: '0',
        contentType: 'image/png',
        upsert: true,
      }),
    );
  });

  it('maps a missing object to null without exposing provider details', async () => {
    const from = jest.fn().mockReturnValue({
      info: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'missing', status: 404, statusCode: '404' },
      }),
    });
    const storage = new SupabaseEvidenceStorage(config, {
      storage: { from },
    } as unknown as SupabaseClient);

    await expect(storage.statObject('org/order/missing')).resolves.toBeNull();
  });
});
