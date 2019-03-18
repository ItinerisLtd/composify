import {Command, flags} from '@oclif/command'
import chalk from 'chalk'
import * as execa from 'execa'
import * as fs from 'fs-extra'
import * as tmp from 'tmp'

function parsePluginHeader(pluginFile: string, field: string, fallback = ''): string {
  const regex = new RegExp(`^[\\s\\*\\#\\@]*${field}\\:(.*)$`, 'mi')
  const match = regex.exec(pluginFile)

  if (match === null) {
    return fallback
  }

  return match[1].trim()
}

class ItinerisltdComposify extends Command {
  static description = 'Turn WordPress plugin zip files into git repositories, so that composer version constraints work properly'

  static flags = {
    // add --version flag to show CLI version
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
    zip: flags.string({
      char: 'z',
      description: 'remote url or local path to the latest zip file [example: https://kinsta.com/kinsta-tools/kinsta-mu-plugins.zip OR /User/me/kinsta-mu-plugins.zip]',
      env: 'COMPOSIFY_ZIP',
      required: true,
    }),
    repo: flags.string({
      char: 'r',
      description: 'url to the latest zip file [example: https://github.com/ItinerisLtd/kinsta-mu-plugins.git]',
      env: 'COMPOSIFY_REPO',
    }),
    file: flags.string({
      char: 'f',
      description: 'main plugin file which containing the plugin header comment [example: kinsta-mu-plugins.php]',
      env: 'COMPOSIFY_FILE',
    }),
    directory: flags.string({
      char: 'd',
      description: 'directory name after unzip [example: kinsta-mu-plugins]',
      env: 'COMPOSIFY_DIRECTORY',
    }),
    name: flags.string({
      char: 'n',
      description: 'package name [example: kinsta-mu-plugins]',
      env: 'COMPOSIFY_NAME',
      required: true,
    }),
    vendor: flags.string({
      char: 'o',
      description: 'vender / organization name [example: itinerisltd]',
      env: 'COMPOSIFY_VENDOR',
      required: true,
    }),
    type: flags.string({
      char: 't',
      description: 'package type',
      env: 'COMPOSIFY_TYPE',
      options: ['wordpress-plugin', 'wordpress-muplugin'],
      default: 'wordpress-plugin',
      required: true,
    }),
    unzipSubdir: flags.boolean({
      char: 'u',
      description: 'unzip file into a sub-directory, only use when default options are breking',
      env: 'COMPOSIFY_UNZIP_SUBDIR',
      default: false,
      allowNo: true,
    }),
  }

  heading(message: string) {
    this.log('') // Line break
    this.log(chalk.bold.magentaBright(`===> ${message}`))
  }

  subheading(message: string) {
    this.log('') // Line break
    this.log(chalk.magenta(`${message}`))
  }

  tips(message: string) {
    this.log(chalk.keyword('orange')(message))
  }

  info(message: string) {
    this.log(chalk.cyan(message))
  }

  logCommand(message: string) {
    this.log(chalk.dim(`  $ ${message}`))
  }

  success(message?: string) {
    this.log('') // Line break
    const text = message ? `Success: ${message}` : 'Success!'
    this.log(chalk.bold.green(text))
  }

  gitTips() {
    this.tips('If this step fails, make sure `--repo` flag is correct. Your system should have both read and write access rights to `--repo`. Needless to say, `--repo` should be exist on remote server.')
    this.log('') // Line break.
    this.tips('Composify defaults to clone with GitHub HTTPS URLs. Use SSH URLs at your own risks. See: https://help.github.com/en/articles/which-remote-url-should-i-use')
    this.log('') // Line break.
    this.tips('You might be prompted for your GitHub username and password. See: https://help.github.com/en/articles/caching-your-github-password-in-git')
  }

  async run() {
    const {flags} = this.parse(ItinerisltdComposify)
    const {name, type, vendor, zip} = flags
    const directory = flags.directory || name
    const file = flags.file || `${name}.php`
    const repo = flags.repo || `https://github.com/${vendor}/${name}.git`
    const unzipSubdir = flags.unzipSubdir ? `/${directory}` : ''

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

    await Promise.all([
      fs.emptyDir(zipWorkingDir),
      fs.emptyDir(gitReadOnlyDir),
      fs.emptyDir(gitWorkingDir),
    ])
    this.info('Created temporary sub-directories')
    // Prepare temporary directories
    this.success()

    this.heading('Fetch plugin zip file')
    // tslint:disable-next-line
    const isRemoteZip = zip.startsWith('https://') || zip.startsWith('http://')

    if (isRemoteZip) {
      this.subheading(`Download from ${zip}`)
      this.logCommand(`wget ${zip} -O ${zipWorkingDir}/composify.zip`)
      await execa('wget', [zip, '-O', `${zipWorkingDir}/composify.zip`])
    } else {
      this.subheading(`Copy from ${zip}`)
      fs.copySync(zip, `${zipWorkingDir}/composify.zip`)
    }

    this.subheading('Unzip plugin file')
    this.logCommand(`unzip -o ${zipWorkingDir}/composify.zip -d ${zipWorkingDir}${unzipSubdir}`)
    await execa('unzip', ['-o', `${zipWorkingDir}/composify.zip`, '-d', `${zipWorkingDir}${unzipSubdir}`])
    // Fetch plugin zip file
    this.success()

    this.heading('Parse plugin meta-information')
    this.tips('If this step fails, make sure `--file` flag is correct. `--file` should be the name of the file contains containing meta-information(Name, Version, Author, etc) regarding the concrete plugin. See: https://codex.wordpress.org/File_Header')

    this.subheading(`Read plugin main file ${zipWorkingDir}/${directory}/${file}`)
    const mainPluginFileContent = fs.readFileSync(`${zipWorkingDir}/${directory}/${file}`, 'utf8')

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
    this.logCommand(`git clone ${repo} ${gitReadOnlyDir}`)
    await execa('git', ['clone', repo, gitReadOnlyDir])

    this.logCommand('git fetch --tags')
    await execa('git', ['fetch', '--tags'], {cwd: gitReadOnlyDir})
    // Fetch git repository
    this.success()

    this.heading('Check version not yet tagged on git remote')
    this.logCommand(`git show-ref --tags --quiet --verify -- refs/tags/${version}`)
    const {code: versionCheckResultCode} = await execa('git', ['show-ref', '--tags', '--quiet', '--verify', '--', `refs/tags/${version}`], {cwd: gitReadOnlyDir}).catch(err => err)

    if (versionCheckResultCode === 0) {
      // TODO!
      this.error(`Version ${version} already tagged on git remote`)
      this.exit(1)
    }
    // Check version not yet tagged on git remote
    this.success()

    this.heading('Overwrite local git repository with plugin files')

    this.subheading(`Copy ${zipWorkingDir}/${directory} to ${gitWorkingDir}`)
    fs.copySync(`${zipWorkingDir}/${directory}`, gitWorkingDir)

    this.subheading(`Remove ${gitWorkingDir}/.git`)
    fs.removeSync(`${gitWorkingDir}/.git`)

    this.subheading(`Copy ${gitReadOnlyDir}/.git to ${gitWorkingDir}/.git`)
    fs.copySync(`${gitReadOnlyDir}/.git`, `${gitWorkingDir}/.git`)

    this.subheading('Generate composer.json')
    const composer = {
      name: `${vendor}/${name}`,
      description,
      type,
      license,
      require: {
        'composer/installers': '^1.6',
      },
      extra: {
        composify: {
          zip,
          file,
          version,
          'build-at': new Date().toISOString(),
        }
      }
    }

    const composerJsonFile = `${gitWorkingDir}/composer.json`
    fs.outputJsonSync(composerJsonFile, composer, {
      spaces: 2,
    })

    const composerJsonFileContent = fs.readFileSync(composerJsonFile, 'utf8')
    this.info(composerJsonFileContent)
    // Overwrite local git repository with plugin files
    this.success()

    this.heading('Commit and tag latest plugin files')
    this.logCommand('git add -A')
    await execa('git', ['add', '-A'], {cwd: gitWorkingDir})

    this.logCommand(`git commit -m Version bump ${version}'`)
    await execa('git', ['commit', '-m', `Version bump ${version}`], {cwd: gitWorkingDir})

    this.logCommand(`git tag -a ${version} -m 'Version bump ${version} by @itinerisltd/composify'`)
    await execa('git', ['tag', '-a', version, '-m', `Version bump ${version} by @itinerisltd/composify`], {cwd: gitWorkingDir})
    // Commit and tag latest plugin files
    this.success()

    this.heading('Push latest plugin files to git remote')
    this.gitTips()

    this.logCommand('git push --follow-tags origin master')
    await execa('git', ['push', '--follow-tags', 'origin', 'master'], {cwd: gitWorkingDir})
    // Push latest plugin files to git remote
    this.success()
  }
}

export = ItinerisltdComposify
