import { createWriteStream } from 'node:fs';
import { mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

/** File type bits of Unix modes, and those of symbolic links. */
const TYPE_MASK = 0o170000;
const SYMLINK = 0o120000;

function readAll(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.once('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    stream.once('error', reject);
  });
}

/**
 * Extracts `zip` into `directory`, keeping the modes of files and symbolic
 * links, e.g., in the app bundles of macOS.
 */
export async function unzip(zip: string, directory: string): Promise<void> {
  const zipfile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(zip, { lazyEntries: true }, (error, zipfile) => {
      if (error === null) {
        resolve(zipfile);
      } else {
        reject(error);
      }
    });
  });
  const extract = async (entry: yauzl.Entry): Promise<void> => {
    // yauzl rejects names outside of the directory.
    const file = path.join(directory, entry.fileName);
    if (entry.fileName.endsWith('/')) {
      await mkdir(file, { recursive: true });
      return;
    }
    await mkdir(path.dirname(file), { recursive: true });
    const stream = await new Promise<Readable>((resolve, reject) => {
      zipfile.openReadStream(entry, (error, stream) => {
        if (error === null) {
          resolve(stream);
        } else {
          reject(error);
        }
      });
    });
    const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
    if ((mode & TYPE_MASK) === SYMLINK) {
      await symlink(await readAll(stream), file);
    } else {
      await pipeline(
        stream,
        createWriteStream(file, { mode: mode & 0o777 || 0o644 }),
      );
    }
  };
  try {
    await new Promise<void>((resolve, reject) => {
      zipfile.once('end', resolve);
      zipfile.once('error', reject);
      zipfile.on('entry', (entry: yauzl.Entry) => {
        extract(entry).then(() => {
          zipfile.readEntry();
        }, reject);
      });
      zipfile.readEntry();
    });
  } finally {
    zipfile.close();
  }
}
