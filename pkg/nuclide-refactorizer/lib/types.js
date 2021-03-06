/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 */

/*
 * This file houses types that are internal to this package. Types that are part of its public
 * interface are exported from main.js
 */

import type {
  AvailableRefactoring,
  RefactorRequest,
  RefactorProvider,
} from '..';

export type Store = {
  subscribe(fn: () => mixed): void, // TODO probably not void
  dispatch(action: RefactorAction): void,
  getState(): RefactorState,
};

// State

export type ClosedState = {|
  type: 'closed',
|};

export type OpenState = {|
  type: 'open',
  phase: Phase,
|};

export type RefactorState = ClosedState | OpenState;

export type GetRefactoringsPhase = {|
  type: 'get-refactorings',
|};

export type PickPhase = {|
  type: 'pick',
  provider: RefactorProvider,
  editor: atom$TextEditor,
  availableRefactorings: Array<AvailableRefactoring>,
|};

export type RenamePhase = {|
  type: 'rename',
  provider: RefactorProvider,
  editor: atom$TextEditor,
  symbolAtPoint: {
    text: string,
    range: atom$Range,
  },
|};

export type ExecutePhase = {|
  type: 'execute',
|};

export type Phase =
  GetRefactoringsPhase |
  PickPhase |
  RenamePhase |
  ExecutePhase;

// Actions

export type OpenAction = {|
  type: 'open',
|};

export type GotRefactoringsAction = {|
  type: 'got-refactorings',
  payload: {
    editor: atom$TextEditor,
    provider: RefactorProvider,
    availableRefactorings: Array<AvailableRefactoring>,
  },
|};

export type CloseAction = {|
  type: 'close',
|};

export type PickedRefactorAction = {|
  type: 'picked-refactor',
  payload: {
    refactoring: AvailableRefactoring,
  },
|};

export type ExecuteAction = {|
  type: 'execute',
  payload: {
    provider: RefactorProvider,
    refactoring: RefactorRequest,
  },
|};

export type RefactorAction =
  OpenAction |
  CloseAction |
  PickedRefactorAction |
  GotRefactoringsAction |
  ExecuteAction;
