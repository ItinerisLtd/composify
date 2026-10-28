import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { execa, Options } from 'execa'
import fse from 'fs-extra'
import { globby } from 'globby'
import { cpSync, readFileSync, rmSync } from 'node:fs'
import * as tmp from 'tmp'

import {
  backupOriginalComposerJson,
  buildComposerJson,
  mergeComposerJson,
  ORIGINAL_COMPOSER_JSON,
  parseComposerJsonOverrides,
} from './composer-json.js'

function parsePluginHeader(pluginFile: string, field: string, fallback = ''): string {
  const regex = new RegExp(`^[\\s\\*\\#\\@]*${field}\\:(.*)$`, 'mi')
  const match = regex.exec(pluginFile)

  if (match === null) {
    return fallback
  }

  return match[1].trim()
}

async function detectExtractedDirectory(parentDir: string): Promise<null | string> {
  const entries = await fse.readdir(parentDir, {
    withFileTypes: true,
  })
  const directories = entries.filter(
    entry => entry.isDirectory() === true && entry.name !== '__MACOSX' && entry.name.startsWith('.') === false,
  )
  if (directories.length === 1) {
    return directories[0].name
  }

  return null
}

async function findPluginFile(directory: string): Promise<null | string> {
  const phpFiles = await globby('*.php', {
    cwd: directory,
    onlyFiles: true,
  })

  // Sort for deterministic behavior
  phpFiles.sort()

  for (const phpFile of phpFiles) {
    const content = readFileSync(`${directory}/${phpFile}`, 'utf8')
    const pluginName = parsePluginHeader(content, 'Plugin Name')
    if (pluginName !== '') {
      return phpFile
    }
  }

  return null
}

export default class ItinerisltdComposify extends Command {
  static description =
    'Turn WordPress plugin zip files into git repositories, so that composer version constraints work properly'
  static flags = {
    // add --version flag to show CLI version
    version: Flags.version({ char: 'v' }),
    help: Flags.help({ char: 'h' }),
    zip: Flags.string({
      char: 'z',
      description:
        'remote url or local path to the latest zip file [example: https://kinsta.com/kinsta-tools/kinsta-mu-plugins.zip OR /User/me/kinsta-mu-plugins.zip]',
      env: 'COMPOSIFY_ZIP',
      required: true,
    }),
    repo: Flags.string({
      char: 'r',
      description:
        'remote url or local path to the git repository [example: https://github.com/ItinerisLtd/kinsta-mu-plugins.git]',
      env: 'COMPOSIFY_REPO',
    }),
    file: Flags.string({
      char: 'f',
      description: 'main plugin file which containing the plugin header comment [example: kinsta-mu-plugins.php]',
      env: 'COMPOSIFY_FILE',
    }),
    directory: Flags.string({
      char: 'd',
      description:
        'directory name after unzip, also used as the install folder (extra.installer-name) when it differs from --name [example: kinsta-mu-plugins]',
      env: 'COMPOSIFY_DIRECTORY',
    }),
    name: Flags.string({
      char: 'n',
      description: 'package name [example: kinsta-mu-plugins]',
      env: 'COMPOSIFY_NAME',
    }),
    vendor: Flags.string({
      char: 'o',
      description: 'vendor / organization name [example: itinerisltd]',
      env: 'COMPOSIFY_VENDOR',
      required: true,
    }),
    type: Flags.string({
      char: 't',
      description: 'package type',
      env: 'COMPOSIFY_TYPE',
      options: ['wordpress-plugin', 'wordpress-muplugin', 'wordpress-theme'],
      default: 'wordpress-plugin',
      required: true,
    }),
    'unzip-subdir': Flags.boolean({
      char: 'u',
      description: 'unzip file into a sub-directory, only use when default options are breaking',
      env: 'COMPOSIFY_UNZIP_SUBDIR',
      default: false,
      allowNo: true,
    }),
    branch: Flags.string({
      char: 'b',
      description: 'the default branch of your remote repository [example: main]',
      env: 'COMPOSIFY_DEFAULT_BRANCH',
      default: 'main',
    }),
    'user-agent': Flags.string({
      description: 'user agent to use when downloading zip file',
      env: 'COMPOSIFY_USER_AGENT',
    }),
    'ignore-changes': Flags.string({
      description:
        'path (git pathspec) to skip when comparing the zip with an existing tag, for files the vendor regenerates on every download [example: licence-data.php]',
      multiple: true,
    }),
    'composer-json': Flags.string({
      description:
        'JSON object, or path to a JSON file, merged into the generated composer.json, where null removes a key [example: {"require":{"php":">=8.2"}}]',
      env: 'COMPOSIFY_COMPOSER_JSON',
    }),
  }
  static strict: boolean = true

  /**
   * Files in `workTree` that differ from the tagged version (git diff --name-status).
   * The plugin's own composer.json is compared with the tag's composer.original.json, and the generated composer.json is ignored.
   * Tags made before composer.original.json existed have no backup, so it is only compared when the tag has one.
   * Uses a separate index and a copy of the plugin files, so neither the clone nor `workTree` is changed.
   */
  async changesSinceTag({
    gitDir,
    ignore,
    indexFile,
    version,
    workTree,
  }: {
    gitDir: string
    ignore: string[]
    indexFile: string
    version: string
    workTree: string
  }): Promise<string> {
    const tag = `refs/tags/${version}`
    const compareTree = `${indexFile}-tree`
    cpSync(workTree, compareTree, { recursive: true })
    backupOriginalComposerJson(compareTree)

    const git = (args: string[]) =>
      this.logAndRunCommand('git', [`--git-dir=${gitDir}/.git`, `--work-tree=${compareTree}`, ...args], {
        env: { GIT_INDEX_FILE: indexFile },
      })

    const tagHasBackup = await git(['cat-file', '-e', `${tag}:${ORIGINAL_COMPOSER_JSON}`]).then(
      () => true,
      () => false,
    )

    await git(['read-tree', `${tag}^{tree}`])
    await git(['add', '-A'])
    const { stdout } = await git([
      'diff',
      '--cached',
      '--name-status',
      tag,
      '--',
      '.',
      ':(exclude)composer.json',
      ...(tagHasBackup ? [] : [`:(exclude)${ORIGINAL_COMPOSER_JSON}`]),
      ...ignore.map(path => `:(exclude)${path}`),
    ])
    return String(stdout).trim()
  }

  gitTips() {
    this.tips(
      'If this step fails, make sure `--repo` flag is correct. Your system should have both read and write access rights to `--repo`.',
    )
    this.log('') // Line break.
    this.tips(
      'Composify defaults to clone with GitHub HTTPS URLs. Use SSH URLs at your own risks. See: https://help.github.com/en/articles/which-remote-url-should-i-use',
    )
    this.log('') // Line break.
    this.tips(
      'You might be prompted for your GitHub username and password. See: https://help.github.com/en/articles/caching-your-github-password-in-git',
    )
  }

  heading(message: string) {
    this.log('') // Line break
    this.log(chalk.bold.magentaBright(`===> ${message}`))
  }

  info(message: string) {
    this.log(chalk.cyan(message))
  }

  async logAndRunCommand(file: string, args?: Readonly<string[]>, options?: Options) {
    let message = file
    if (Array.isArray(args)) {
      message = [file, ...args].join(' ')
    }

    this.log(chalk.dim(`  $ ${message}`))
    return execa(file, args, options)
  }

  subheading(message: string) {
    this.log('') // Line break
    this.log(chalk.magenta(`${message}`))
  }

  success(message?: string) {
    this.log('') // Line break
    const text = message ? `Success: ${message}` : 'Success!'
    this.log(chalk.bold.green(text))
  }

  tips(message: string) {
    this.log(chalk.rgb(255, 165, 0)(message))
  }

  /* eslint-disable-next-line perfectionist/sort-classes */
  async run(): Promise<void> {
    const { flags } = await this.parse(ItinerisltdComposify)
    const { type, vendor, zip, branch } = flags
    const userAgent = flags['user-agent'] || `composify/${this.config.version}; ${this.config.pjson.homepage}`
    const composerJsonOverrides = parseComposerJsonOverrides(flags['composer-json'])

    this.heading('Prepare temporary directories')
    tmp.setGracefulCleanup()

    const { name: tempDir } = tmp.dirSync({
      prefix: 'composify-',
      unsafeCleanup: true,
    })
    this.info(`Created temporary directories ${tempDir}`)

    const zipWorkingDir = `${tempDir}/zip/working`
    const gitReadOnlyDir = `${tempDir}/git/read-only`
    const gitWorkingDir = `${tempDir}/git/working`

    await Promise.all([fse.emptyDir(zipWorkingDir), fse.emptyDir(gitReadOnlyDir), fse.emptyDir(gitWorkingDir)])
    this.info('Created temporary sub-directories')
    // Prepare temporary directories
    this.success()

    this.heading('Fetch plugin zip file')
    // tslint:disable-next-line
    const isRemoteZip = zip.startsWith('https://') || zip.startsWith('http://')

    if (isRemoteZip) {
      this.subheading(`Download from ${zip}`)
      await this.logAndRunCommand('wget', [zip, '-U', userAgent, '-O', `${zipWorkingDir}/composify.zip`])
    } else {
      this.subheading(`Copy from ${zip}`)
      cpSync(zip, `${zipWorkingDir}/composify.zip`)
    }

    this.subheading('Unzip plugin file')

    const { directory, name } = await this.unzipAndResolveName({
      directory: flags.directory,
      name: flags.name,
      unzipSubdir: flags['unzip-subdir'],
      zipWorkingDir,
    })

    const repo = flags.repo || `https://github.com/${vendor}/${name}.git`

    // Fetch plugin zip file
    this.success()

    this.heading('Detect main plugin file')
    const { file: flagFile } = flags
    let file = flagFile
    if (file) {
      this.info(`Using specified plugin file: ${file}`)
    } else {
      this.subheading(`Auto-detecting plugin file in ${zipWorkingDir}/${directory}`)
      const detectedFile = await findPluginFile(`${zipWorkingDir}/${directory}`)
      if (detectedFile) {
        file = detectedFile
        this.info(`Auto-detected plugin file: ${file}`)
      } else {
        file = `${name}.php`
        this.info(`No plugin file detected, using default: ${file}`)
      }
    }

    // Detect main plugin file
    this.success()

    this.heading('Parse plugin meta-information')
    this.tips(
      'If this step fails, make sure `--file` flag is correct. `--file` should be the name of the file containing meta-information (Name, Version, Author, etc) regarding the concrete plugin. See: https://codex.wordpress.org/File_Header',
    )

    this.subheading(`Read plugin main file ${zipWorkingDir}/${directory}/${file}`)
    const mainPluginFileContent = readFileSync(`${zipWorkingDir}/${directory}/${file}`, 'utf8')

    this.subheading('Parse plugin main file')
    const [version, license, description] = await Promise.all([
      parsePluginHeader(mainPluginFileContent, 'Version'),
      parsePluginHeader(mainPluginFileContent, 'License', 'proprietary'),
      parsePluginHeader(mainPluginFileContent, 'Description', `Composified by @itinerisltd/composify from ${zip}`),
    ])
    this.info(`Version: ${version}`)
    this.info(`License: ${license}`)
    this.info(`Description: ${description}`)

    if (version === '') {
      this.error('Version not found')
    }

    // Parse plugin meta-information
    this.success()

    this.heading('Fetch git repository')
    this.gitTips()

    this.subheading('Clone and fetch git repository')
    await this.logAndRunCommand('git', ['clone', repo, gitReadOnlyDir])

    await this.logAndRunCommand('git', ['fetch', '--tags'], { cwd: gitReadOnlyDir })

    // Fetch git repository
    this.success()

    this.heading('Check version not yet tagged on git remote')
    const { exitCode: versionCheckResultCode } = await this.logAndRunCommand(
      'git',
      ['show-ref', '--tags', '--quiet', '--verify', '--', `refs/tags/${version}`],
      { cwd: gitReadOnlyDir },
    ).catch(error => error)

    if (versionCheckResultCode === 0) {
      // The vendor may have replaced the zip without changing the version, e.g. a compromised
      // download server serving malware under an existing version number. Never retag, but fail
      // loudly so someone checks the zip before anyone relies on the mirrored copy.
      this.heading('Compare plugin files with the existing tag')
      const changes = await this.changesSinceTag({
        gitDir: gitReadOnlyDir,
        ignore: flags['ignore-changes'] ?? [],
        indexFile: `${tempDir}/git/compare-index`,
        version,
        workTree: `${zipWorkingDir}/${directory}`,
      })
      if (changes !== '') {
        this.log(changes)
        this.error(
          `Version ${version} is already tagged on git remote, but the zip's files differ from the tag. The vendor may have re-released or tampered with this version: check the zip before trusting either copy.`,
        )
      }

      this.success(`Version ${version} already tagged on git remote, with the same files`)
      this.exit(0)
    }

    // Check version not yet tagged on git remote
    this.success()

    this.heading('Check local branch name')
    const { stdout: localBranchName } = await this.logAndRunCommand('git', ['branch', '--show-current'], {
      cwd: gitReadOnlyDir,
    }).catch(error => error)

    if (branch !== localBranchName) {
      this.subheading('Changing local branch name')
      await this.logAndRunCommand('git', ['branch', '-m', branch], { cwd: gitReadOnlyDir }).catch(error => error)
    }

    this.heading('Overwrite local git repository with plugin files')

    this.subheading(`Copy ${zipWorkingDir}/${directory} to ${gitWorkingDir}`)
    cpSync(`${zipWorkingDir}/${directory}`, gitWorkingDir, { recursive: true })

    this.subheading(`Remove ${gitWorkingDir}/.git`)
    rmSync(`${gitWorkingDir}/.git`, { force: true, recursive: true })

    this.subheading(`Copy ${gitReadOnlyDir}/.git to ${gitWorkingDir}/.git`)
    cpSync(`${gitReadOnlyDir}/.git`, `${gitWorkingDir}/.git`, { recursive: true })

    if (backupOriginalComposerJson(gitWorkingDir)) {
      this.info(`Saved the plugin's own composer.json as ${ORIGINAL_COMPOSER_JSON}`)
    }

    this.subheading('Generate composer.json')
    const generatedComposer = buildComposerJson({
      buildAt: new Date().toISOString(),
      description,
      directory,
      file,
      license,
      name,
      type,
      vendor,
      version,
      zip,
    })
    const composer = mergeComposerJson(generatedComposer, composerJsonOverrides)

    const composerJsonFile = `${gitWorkingDir}/composer.json`
    fse.outputJSONSync(composerJsonFile, composer, {
      spaces: 2,
    })

    const composerJsonFileContent = readFileSync(composerJsonFile, 'utf8')
    this.info(composerJsonFileContent)
    // Overwrite local git repository with plugin files
    this.success()

    this.heading('Commit and tag latest plugin files')
    await this.logAndRunCommand('git', ['add', '-A'], { cwd: gitWorkingDir })

    await this.logAndRunCommand('git', ['commit', '-m', `Version bump ${version}`], { cwd: gitWorkingDir })

    await this.logAndRunCommand(
      'git',
      ['tag', '-a', version, '-m', `Version bump ${version} by @itinerisltd/composify`],
      { cwd: gitWorkingDir },
    )
    // Commit and tag latest plugin files
    this.success()

    this.heading('Push latest plugin files to git remote')
    this.gitTips()

    await this.logAndRunCommand('git', ['push', '--follow-tags', 'origin', branch], { cwd: gitWorkingDir })
    // Push latest plugin files to git remote
    this.success()
  }

  /**
   * Unzip the plugin, then resolve the package name and the plugin's folder.
   * When only one of them is given, the other falls back to it.
   * When neither is given, both come from the single folder the zip extracts to.
   */
  async unzipAndResolveName({
    directory: flagDirectory,
    name: flagName,
    unzipSubdir,
    zipWorkingDir,
  }: {
    directory?: string
    name?: string
    unzipSubdir: boolean
    zipWorkingDir: string
  }): Promise<{ directory: string; name: string }> {
    const zipFile = `${zipWorkingDir}/composify.zip`
    const name = flagName || flagDirectory
    const directory = flagDirectory || flagName

    if (name && directory) {
      const destination = unzipSubdir ? `${zipWorkingDir}/${directory}` : zipWorkingDir
      await this.logAndRunCommand('unzip', ['-o', zipFile, '-d', destination])
      return { directory, name }
    }

    if (unzipSubdir) {
      this.error(
        'When using --unzip-subdir without --name or --directory, cannot auto-detect plugin name. Please provide --name or --directory flag.',
      )
    }

    await this.logAndRunCommand('unzip', ['-o', zipFile, '-d', zipWorkingDir])

    this.subheading('Auto-detecting plugin name from extracted directory')
    const detectedDir = await detectExtractedDirectory(zipWorkingDir)
    if (!detectedDir) {
      this.error(
        'Could not auto-detect plugin name. Multiple or no directories found after extraction. Please provide --name or --directory flag.',
      )
    }

    this.info(`Auto-detected name: ${detectedDir}`)
    return { directory: detectedDir, name: detectedDir }
  }
}
