/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import paths from '@elastic/simple-git/dist/util/paths';
import { spawn } from 'child_process';
import fs from 'fs';
import getPort from 'get-port';
import * as glob from 'glob';
import { platform as getOsPlatform } from 'os';
import path from 'path';
import { MarkupKind } from 'vscode-languageserver-protocol';
import { Logger } from '../log';
import { ServerOptions } from '../server_options';
import { LoggerFactory } from '../utils/log_factory';
import { AbstractLauncher } from './abstract_launcher';
import { ExternalProgram } from './process/external_program';
import { LanguageServerProxy } from './proxy';
import { InitializeOptions, RequestExpander } from './request_expander';

const GO_LANG_DETACH_PORT = 2091;

export class GoServerLauncher extends AbstractLauncher {
  constructor(
    public readonly targetHost: string,
    public readonly options: ServerOptions,
    public readonly loggerFactory: LoggerFactory,
    public readonly installationPath: string
  ) {
    super('go', targetHost, options, loggerFactory);
  }

  createExpander(
    proxy: LanguageServerProxy,
    builtinWorkspace: boolean,
    maxWorkspace: number
  ): RequestExpander {
    return new RequestExpander(
      proxy,
      builtinWorkspace,
      maxWorkspace,
      this.options,
      {
        initialOptions: {
          installGoDependency: this.options.security.installGoDependency,
        },
        clientCapabilities: {
          textDocument: {
            hover: {
              contentFormat: [MarkupKind.Markdown, MarkupKind.PlainText],
            },
          },
        },
      } as InitializeOptions,
      this.log
    );
  }

  async startConnect(proxy: LanguageServerProxy) {
    await proxy.connect();
  }

  async getPort() {
    if (!this.options.lsp.detach) {
      return await getPort();
    }
    return GO_LANG_DETACH_PORT;
  }

  private async getBundledGoToolchain(installationPath: string, log: Logger) {
    const GoToolchain = glob.sync('**/go/**', {
      cwd: installationPath,
    });
    if (!GoToolchain.length) {
      return undefined;
    }
    return path.resolve(installationPath, GoToolchain[0]);
  }

  async spawnProcess(port: number, log: Logger) {
    const launchersFound = glob.sync(
      process.platform === 'win32' ? 'go-langserver.exe' : 'go-langserver',
      {
        cwd: this.installationPath,
      }
    );
    if (!launchersFound.length) {
      throw new Error('Cannot find executable go language server');
    }

    const goToolchain = await this.getBundledGoToolchain(this.installationPath, log);
    if (!goToolchain) {
      throw new Error('Cannot find go toolchain in bundle installation');
    }

    const goRoot = goToolchain;
    const goHome = path.resolve(goToolchain, 'bin');
    const goPath = this.options.goPath;
    if (!fs.existsSync(goPath)) {
      fs.mkdirSync(goPath);
    }
    const goCache = path.resolve(goPath, '.cache');

    const langserverRelatedEnv: { [name: string]: string } = {
      GOROOT: goRoot,
      GOPATH: goPath,
      GOCACHE: goCache,
      CGO_ENABLED: '0',
    };

    // Always prefer the bundled git.
    const platform = getOsPlatform();
    const git = paths(platform);
    const gitPath = path.dirname(git.binPath);
    if (platform !== 'win32') {
      langserverRelatedEnv.PREFIX = git.nativeDir;
      if (platform === 'linux') {
        langserverRelatedEnv.GIT_SSL_CAINFO = path.join(git.nativeDir, 'ssl/cacert.pem');
      }
    }

    const params: string[] = ['-port=' + port.toString()];
    const golsp = path.resolve(this.installationPath, launchersFound[0]);
    const env = Object.create(process.env);
    env.PATH = gitPath + path.delimiter + goHome + path.delimiter + env.PATH;
    const p = spawn(golsp, params, {
      detached: false,
      stdio: 'pipe',
      env: {
        ...env,
        CLIENT_HOST: '127.0.0.1',
        CLIENT_PORT: port.toString(),
        ...langserverRelatedEnv,
      },
    });
    p.stdout.on('data', data => {
      log.stdout(data.toString());
    });
    p.stderr.on('data', data => {
      log.stderr(data.toString());
    });
    log.info(
      `Launch Go Language Server at port ${port.toString()}, pid:${p.pid}, GOROOT:${goRoot}`
    );
    return new ExternalProgram(p, this.options, log);
  }
}
