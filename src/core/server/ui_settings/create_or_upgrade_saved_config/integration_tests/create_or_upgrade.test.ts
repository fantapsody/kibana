/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import expect from '@kbn/expect';
import { UnwrapPromise } from '@kbn/utility-types';
import { SavedObjectsClientContract } from 'src/core/server';

import KbnServer from '../../../../../legacy/server/kbn_server';
import { createTestServers } from '../../../../../test_utils/kbn_server';
import { createOrUpgradeSavedConfig } from '../create_or_upgrade_saved_config';
import { loggingServiceMock } from '../../../logging/logging_service.mock';

const logger = loggingServiceMock.create().get();
describe('createOrUpgradeSavedConfig()', () => {
  let savedObjectsClient: SavedObjectsClientContract;
  let kbnServer: KbnServer;
  let servers: ReturnType<typeof createTestServers>;
  let esServer: UnwrapPromise<ReturnType<typeof servers['startES']>>;
  let kbn: UnwrapPromise<ReturnType<typeof servers['startKibana']>>;

  beforeAll(async function() {
    servers = createTestServers({
      adjustTimeout: t => {
        jest.setTimeout(t);
      },
      settings: {},
    });
    esServer = await servers.startES();
    kbn = await servers.startKibana();
    kbnServer = kbn.kbnServer;

    const savedObjects = kbnServer.server.savedObjects;
    savedObjectsClient = savedObjects.getScopedSavedObjectsClient({});

    await savedObjectsClient.bulkCreate([
      {
        id: '5.4.0-SNAPSHOT',
        type: 'config',
        attributes: {
          buildNum: 54090,
          '5.4.0-SNAPSHOT': true,
        },
      },
      {
        id: '5.4.0-rc1',
        type: 'config',
        attributes: {
          buildNum: 54010,
          '5.4.0-rc1': true,
        },
      },
      {
        id: '@@version',
        type: 'config',
        attributes: {
          buildNum: 99999,
          '@@version': true,
        },
      },
    ]);
  });

  afterAll(async () => {
    await esServer.stop();
    await kbn.stop();
  }, 30000);

  it('upgrades the previous version on each increment', async function() {
    jest.setTimeout(30000);
    // ------------------------------------
    // upgrade to 5.4.0
    await createOrUpgradeSavedConfig({
      savedObjectsClient,
      version: '5.4.0',
      buildNum: 54099,
      log: logger,
    });

    const config540 = await savedObjectsClient.get('config', '5.4.0');
    expect(config540)
      .to.have.property('attributes')
      .eql({
        // should have the new build number
        buildNum: 54099,

        // 5.4.0-SNAPSHOT and @@version were ignored so we only have the
        // attributes from 5.4.0-rc1, even though the other build nums are greater
        '5.4.0-rc1': true,
      });

    // add the 5.4.0 flag to the 5.4.0 savedConfig
    await savedObjectsClient.update('config', '5.4.0', {
      '5.4.0': true,
    });

    // ------------------------------------
    // upgrade to 5.4.1
    await createOrUpgradeSavedConfig({
      savedObjectsClient,
      version: '5.4.1',
      buildNum: 54199,
      log: logger,
    });

    const config541 = await savedObjectsClient.get('config', '5.4.1');
    expect(config541)
      .to.have.property('attributes')
      .eql({
        // should have the new build number
        buildNum: 54199,

        // should also include properties from 5.4.0 and 5.4.0-rc1
        '5.4.0': true,
        '5.4.0-rc1': true,
      });

    // add the 5.4.1 flag to the 5.4.1 savedConfig
    await savedObjectsClient.update('config', '5.4.1', {
      '5.4.1': true,
    });

    // ------------------------------------
    // upgrade to 7.0.0-rc1
    await createOrUpgradeSavedConfig({
      savedObjectsClient,
      version: '7.0.0-rc1',
      buildNum: 70010,
      log: logger,
    });

    const config700rc1 = await savedObjectsClient.get('config', '7.0.0-rc1');
    expect(config700rc1)
      .to.have.property('attributes')
      .eql({
        // should have the new build number
        buildNum: 70010,

        // should also include properties from 5.4.1, 5.4.0 and 5.4.0-rc1
        '5.4.1': true,
        '5.4.0': true,
        '5.4.0-rc1': true,
      });

    // tag the 7.0.0-rc1 doc
    await savedObjectsClient.update('config', '7.0.0-rc1', {
      '7.0.0-rc1': true,
    });

    // ------------------------------------
    // upgrade to 7.0.0
    await createOrUpgradeSavedConfig({
      savedObjectsClient,
      version: '7.0.0',
      buildNum: 70099,
      log: logger,
    });

    const config700 = await savedObjectsClient.get('config', '7.0.0');
    expect(config700)
      .to.have.property('attributes')
      .eql({
        // should have the new build number
        buildNum: 70099,

        // should also include properties from ancestors, including 7.0.0-rc1
        '7.0.0-rc1': true,
        '5.4.1': true,
        '5.4.0': true,
        '5.4.0-rc1': true,
      });

    // tag the 7.0.0 doc
    await savedObjectsClient.update('config', '7.0.0', {
      '7.0.0': true,
    });

    // ------------------------------------
    // "downgrade" to 6.2.3-rc1
    await createOrUpgradeSavedConfig({
      savedObjectsClient,
      version: '6.2.3-rc1',
      buildNum: 62310,
      log: logger,
    });

    const config623rc1 = await savedObjectsClient.get('config', '6.2.3-rc1');
    expect(config623rc1)
      .to.have.property('attributes')
      .eql({
        // should have the new build number
        buildNum: 62310,

        // should also include properties from ancestors, but not 7.0.0-rc1 or 7.0.0
        '5.4.1': true,
        '5.4.0': true,
        '5.4.0-rc1': true,
      });
  });
});
