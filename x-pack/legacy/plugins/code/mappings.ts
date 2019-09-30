/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { SAVED_OBJ_REPO_REF } from './common/constants';

export const mappings = {
  [SAVED_OBJ_REPO_REF]: {
    properties: {
      uri: {
        type: 'keyword',
      },
      namespaces: {
        type: 'keyword',
      },
    },
  },
};
