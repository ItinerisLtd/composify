import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
import {Options, execa} from 'execa'
import * as fs from 'fs-extra'
import {readFileSync, copyFileSync, rmdirSync} from 'node:fs'
import * as tmp from 'tmp'

function parsePluginHeader(pluginFile: string, field: string, fallback = ''): string {
  const regex = new RegExp(`^[\\s\\*\\#\\@]*${field}\\:(.*)$`, 'mi')
  const match = regex.exec(pluginFile)

  if (match === null) {
    return fallback
  }

  return match[1].trim()
}

export class ItinerisltdComposify extends Command {
  static description =
    'Turn WordPress plugin zip files into git repositories, so that composer version constraints work properly'

  static flags = {
    branch: Flags.string({
      char: 'b',
      default: 'main',
      description: 'the default branch of your remote repository [example: main]',
      env: 'COMPOSIFY_DEFAULT_BRANCH',
    }),
    directory: Flags.string({
      char: 'd',
      description: 'directory name after unzip [example: kinsta-mu-plugins]',
      env: 'COMPOSIFY_DIRECTORY',
    }),
    file: Flags.string({
      char: 'f',
      description: 'main plugin file which containing the plugin header comment [example: kinsta-mu-plugins.php]',
      env: 'COMPOSIFY_FILE',
    }),
    help: Flags.help({char: 'h'}),
    name: Flags.string({
      char: 'n',
      description: 'package name [example: kinsta-mu-plugins]',
      env: 'COMPOSIFY_NAME',
      required: true,
    }),
    repo: Flags.string({
      char: 'r',
      description:
        'remote url or local path to the gti repository [example: https://github.com/ItinerisLtd/kinsta-mu-plugins.git]',
      env: 'COMPOSIFY_REPO',
    }),
    type: Flags.string({
      char: 't',
      default: 'wordpress-plugin',
      description: 'package type',
      env: 'COMPOSIFY_TYPE',
      options: ['wordpress-plugin', 'wordpress-muplugin', 'wordpress-theme'],
      required: true,
    }),
    'unzip-subdir': Flags.boolean({
      allowNo: true,
      char: 'u',
      default: false,
      description: 'unzip file into a sub-directory, only use when default options are breaking',
      env: 'COMPOSIFY_UNZIP_SUBDIR',
    }),
    vendor: Flags.string({
      char: 'o',
      description: 'vendor / organization name [example: itinerisltd]',
      env: 'COMPOSIFY_VENDOR',
      required: true,
    }),
    // add --version flag to show CLI version
    version: Flags.version({char: 'v'}),
    zip: Flags.string({
      char: 'z',
      description:
        'remote url or local path to the latest zip file [example: https://kinsta.com/kinsta-tools/kinsta-mu-plugins.zip OR /User/me/kinsta-mu-plugins.zip]',
      env: 'COMPOSIFY_ZIP',
      required: true,
    }),
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

  async run(): Promise<void> {
    const {flags} = await this.parse(ItinerisltdComposify)
    const {branch, name, type, vendor, zip} = flags
    const directory = flags.directory || name
    const file = flags.file || `${name}.php`
    const repo = flags.repo || `https://github.com/${vendor}/${name}.git`
    const unzipSubdir = flags['unzip-subdir'] ? `/${directory}` : ''

    this.heading('Prepare temporary directories')
    tmp.setGracefulCleanup()

    const {name: tempDir} = tmp.dirSync({
      prefix: 'composify-',
      unsafeCleanup: true,
    })
    this.info(`Created temporary directories ${tempDir}`)

    const zipWorkingDir = `${tempDir}/zip/working`
    const gitReadOnlyDir = `${tempDir}/git/read-only`
    const gitWorkingDir = `${tempDir}/git/working`

    await Promise.all([fs.emptyDir(zipWorkingDir), fs.emptyDir(gitReadOnlyDir), fs.emptyDir(gitWorkingDir)])
    this.info('Created temporary sub-directories')
    // Prepare temporary directories
    this.success()

    this.heading('Fetch plugin zip file')
    // tslint:disable-next-line
    const isRemoteZip = zip.startsWith('https://') || zip.startsWith('http://')

    if (isRemoteZip) {
      this.subheading(`Download from ${zip}`)
      await this.logAndRunCommand('wget', [
        zip,
        '-O',
        `${zipWorkingDir}/composify.zip`,
      ])
    } else {
      this.subheading(`Copy from ${zip}`)
      copyFileSync(zip, `${zipWorkingDir}/composify.zip`)
    }

    this.subheading('Unzip plugin file')
    await this.logAndRunCommand('unzip', [
      '-o',
      `${zipWorkingDir}/composify.zip`,
      '-d',
      `${zipWorkingDir}${unzipSubdir}`,
    ])
    // Fetch plugin zip file
    this.success()

    this.heading('Parse plugin meta-information')
    this.tips(
      'If this step fails, make sure `--file` flag is correct. `--file` should be the name of the file contains containing meta-information(Name, Version, Author, etc) regarding the concrete plugin. See: https://codex.wordpress.org/File_Header',
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

    await this.logAndRunCommand('git', ['fetch', '--tags'], {cwd: gitReadOnlyDir})
    // Fetch git repository
    this.success()

    this.heading('Check version not yet tagged on git remote')
    const {exitCode: versionCheckResultCode} = await this.logAndRunCommand(
      'git',
      ['show-ref', '--tags', '--quiet', '--verify', '--', `refs/tags/${version}`],
      {cwd: gitReadOnlyDir},
    ).catch(error => error)

    if (versionCheckResultCode === 0) {
      this.success(`Version ${version} already tagged on git remote`)
      this.exit(0)
    }

    // Check version not yet tagged on git remote
    this.success()

    this.heading('Check local branch name')
    const {stdout: localBranchName} = await this.logAndRunCommand('git', ['branch', '--show-current'], {
      cwd: gitReadOnlyDir,
    }).catch(error => error)

    if (branch !== localBranchName) {
      this.subheading('Changing local branch name')
      await this.logAndRunCommand('git', ['branch', '-m', branch], {cwd: gitReadOnlyDir}).catch(error => error)
    }

    this.heading('Overwrite local git repository with plugin files')

    this.subheading(`Copy ${zipWorkingDir}/${directory} to ${gitWorkingDir}`)
    copyFileSync(`${zipWorkingDir}/${directory}`, gitWorkingDir)

    this.subheading(`Remove ${gitWorkingDir}/.git`)
    rmdirSync(`${gitWorkingDir}/.git`)

    this.subheading(`Copy ${gitReadOnlyDir}/.git to ${gitWorkingDir}/.git`)
    copyFileSync(`${gitReadOnlyDir}/.git`, `${gitWorkingDir}/.git`)

    this.subheading('Generate composer.json')
    const composer = {
      description,
      extra: {
        composify: {
          'build-at': new Date().toISOString(),
          file,
          version,
          zip,
        },
      },
      license,
      name: `${vendor}/${name}`,
      require: {
        'composer/installers': '^1.6',
      },
      type,
    }

    const composerJsonFile = `${gitWorkingDir}/composer.json`
    fs.outputJsonSync(composerJsonFile, composer, {
      spaces: 2,
    })

    const composerJsonFileContent = readFileSync(composerJsonFile, 'utf8')
    this.info(composerJsonFileContent)
    // Overwrite local git repository with plugin files
    this.success()

    this.heading('Commit and tag latest plugin files')
    await this.logAndRunCommand('git', ['add', '-A'], {cwd: gitWorkingDir})

    await this.logAndRunCommand('git', ['commit', '-m', `Version bump ${version}`], {cwd: gitWorkingDir})

    await this.logAndRunCommand(
      'git',
      ['tag', '-a', version, '-m', `Version bump ${version} by @itinerisltd/composify`],
      {cwd: gitWorkingDir},
    )
    // Commit and tag latest plugin files
    this.success()

    this.heading('Push latest plugin files to git remote')
    this.gitTips()

    await this.logAndRunCommand('git', ['push', '--follow-tags', 'origin', branch], {cwd: gitWorkingDir})
    // Push latest plugin files to git remote
    this.success()
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
}
