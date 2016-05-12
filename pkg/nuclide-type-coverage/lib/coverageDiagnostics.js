'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {NuclideUri} from '../../nuclide-remote-uri';
import type {Result} from '../../nuclide-active-editor-based-service';
import type {
  ObservableDiagnosticProvider,
  DiagnosticProviderUpdate,
  FileDiagnosticMessage,
} from '../../nuclide-diagnostics-base';

import type {CoverageResult, CoverageProvider} from './types';

import invariant from 'assert';
import {Observable} from 'rxjs';

import {toggle, compact} from '../../nuclide-commons';

export function diagnosticProviderForResultStream(
  results: Observable<Result<CoverageProvider, ?CoverageResult>>,
  isEnabledStream: Observable<boolean>,
): ObservableDiagnosticProvider {
  const toggledResults = toggle(results, isEnabledStream);

  return {
    updates: compact(toggledResults.map(diagnosticsForResult)),
    invalidations: Observable.merge(
      // Invalidate diagnostics when display is disabled
      isEnabledStream.filter(enabled => !enabled),
      toggledResults.filter(result => {
        switch (result.kind) {
          case 'not-text-editor':
          case 'no-provider':
          case 'provider-error':
          case 'pane-change':
            return true;
          case 'result':
            return result.result == null;
          default:
            return false;
        }
      }),
    ).mapTo({scope: 'all'}),
  };
}

/**
 * Preconditions:
 *   result.editor.getPath() != null
 *
 * This is reasonable because we only query providers when there is a path available for the current
 * text editor.
 */
function diagnosticsForResult(
  result: Result<CoverageProvider, ?CoverageResult>,
): ?DiagnosticProviderUpdate {
  if (result.kind !== 'result') {
    return null;
  }
  const value = result.result;
  if (value == null) {
    return null;
  }

  const editorPath = result.editor.getPath();
  invariant(editorPath != null);

  const diagnostics = value.uncoveredRanges.map(
    range => uncoveredRangeToDiagnostic(range, editorPath)
  );

  return {
    filePathToMessages: new Map([[editorPath, diagnostics]]),
  };
}

function uncoveredRangeToDiagnostic(range: atom$Range, path: NuclideUri): FileDiagnosticMessage {
  return {
    scope: 'file',
    providerName: 'Type Coverage',
    type: 'Warning',
    filePath: path,
    range,
    text: 'Not covered by the type system',
  };
}