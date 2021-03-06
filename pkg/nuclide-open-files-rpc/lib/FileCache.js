'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {NuclideUri} from '../../commons-node/nuclideUri';
import type {
  FileOpenEvent,
  FileCloseEvent,
  FileEditEvent,
  FileEvent,
  FileVersion,
} from './rpc-types';

import TextBuffer from 'simple-text-buffer';
import invariant from 'assert';
import {Subject, Observable} from 'rxjs';
import {FileVersionNotifier} from './FileVersionNotifier';
import UniversalDisposable from '../../commons-node/UniversalDisposable';

export type LocalFileEvent = FileOpenEvent | FileCloseEvent | FileEditEvent;

export class FileCache {
  _buffers: Map<NuclideUri, atom$TextBuffer>;
  _requests: FileVersionNotifier;
  _events: Subject<LocalFileEvent>;
  _resources: UniversalDisposable;

  constructor() {
    this._buffers = new Map();
    this._events = new Subject();
    this._requests = new FileVersionNotifier();

    this._resources = new UniversalDisposable();
    this._resources.add(this._requests);
    this._resources.add(this._events.subscribe(event => { this._requests.onEvent(event); }));
  }

  // If any out of sync state is detected then an Error is thrown.
  // This will force the client to send a 'sync' event to get back on track.
  onEvent(event: FileEvent): Promise<void> {
    const filePath = event.fileVersion.filePath;
    const changeCount = event.fileVersion.version;
    const buffer = this._buffers.get(filePath);
    switch (event.kind) {
      case 'open':
        invariant(buffer == null);
        this._open(filePath, event.contents, changeCount);
        break;
      case 'close':
        invariant(buffer != null);
        this._buffers.delete(filePath);
        this._emitClose(filePath, buffer);
        buffer.destroy();
        break;
      case 'edit':
        invariant(buffer != null);
        invariant(buffer.changeCount === (changeCount - 1));
        invariant(buffer.getTextInRange(event.oldRange) === event.oldText);
        buffer.setTextInRange(event.oldRange, event.newText);
        invariant(buffer.changeCount === changeCount);
        this._events.next(event);
        break;
      case 'sync':
        if (buffer == null) {
          this._open(filePath, event.contents, changeCount);
        } else {
          this._syncEdit(filePath, buffer, event.contents, changeCount);
        }
        break;
      default:
        throw new Error(`Unexpected FileEvent.kind: ${event.kind}`);
    }
    return Promise.resolve(undefined);
  }

  _syncEdit(
    filePath: NuclideUri,
    buffer: atom$TextBuffer,
    contents: string,
    changeCount: number,
  ): void {
    // messages are out of order
    if (changeCount < buffer.changeCount) {
      return;
    }

    const oldText = buffer.getText();
    const oldRange = buffer.getRange();
    buffer.setText(contents);
    const newRange = buffer.getRange();
    buffer.changeCount = changeCount;
    this._events.next(createEditEvent(
      this.createFileVersion(filePath, changeCount),
      oldRange,
      oldText,
      newRange,
      buffer.getText(),
    ));
  }

  _open(filePath: NuclideUri, contents: string, changeCount: number): void {
    // We never call setPath on these TextBuffers as that will
    // start the TextBuffer attempting to sync with the file system.
    const newBuffer: atom$TextBuffer = new TextBuffer(contents);
    newBuffer.changeCount = changeCount;
    this._buffers.set(filePath, newBuffer);
    this._events.next(createOpenEvent(this.createFileVersion(filePath, changeCount), contents));
  }

  dispose(): void {
    for (const [filePath, buffer] of this._buffers.entries()) {
      this._emitClose(filePath, buffer);
      buffer.destroy();
    }
    this._buffers.clear();
    this._resources.dispose();
    this._events.complete();
  }

  getBuffer(filePath: NuclideUri): ?atom$TextBuffer {
    return this._buffers.get(filePath);
  }

  async getBufferAtVersion(fileVersion: FileVersion): Promise<atom$TextBuffer> {
    await this._requests.waitForBufferAtVersion(fileVersion);

    const buffer = this._buffers.get(fileVersion.filePath);
    if (buffer == null) {
      throw new Error('File closed at requested revision');
    } if (buffer.changeCount !== fileVersion.version) {
      throw new Error('Sync error. File at unexpected version');
    }
    return buffer;
  }

  observeFileEvents(): Observable<LocalFileEvent> {
    return Observable.from(
      Array.from(this._buffers.entries()).map(([filePath, buffer]) => {
        invariant(buffer != null);
        return createOpenEvent(
          this.createFileVersion(filePath, buffer.changeCount),
          buffer.getText());
      })).concat(this._events);
  }

  _emitClose(filePath: NuclideUri, buffer: atom$TextBuffer): void {
    this._events.next(createCloseEvent(
      this.createFileVersion(filePath, buffer.changeCount)));
  }

  createFileVersion(
    filePath: NuclideUri,
    version: number,
  ): FileVersion {
    return {
      notifier: this,
      filePath,
      version,
    };
  }
}

function createOpenEvent(
  fileVersion: FileVersion,
  contents: string,
): FileOpenEvent {
  return {
    kind: 'open',
    fileVersion,
    contents,
  };
}

function createCloseEvent(
  fileVersion: FileVersion,
): FileCloseEvent {
  return {
    kind: 'close',
    fileVersion,
  };
}

function createEditEvent(
  fileVersion: FileVersion,
  oldRange: atom$Range,
  oldText: string,
  newRange: atom$Range,
  newText: string,
): FileEditEvent {
  return {
    kind: 'edit',
    fileVersion,
    oldRange,
    oldText,
    newRange,
    newText,
  };
}
