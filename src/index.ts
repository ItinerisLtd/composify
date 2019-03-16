import {Command, flags} from '@oclif/command'
import * as execa from 'execa'
import * as fs from 'fs-extra'
import * as Listr from 'listr'

const tempDir = 'tmp-composify'
const zipWorkingDir = `${tempDir}/zip/working`
const gitReadOnlyDir = `${tempDir}/git/read-only`
const gitWorkingDir = `${tempDir}/git/working`

function parsePluginHeader(pluginFile: string, field: string, fallback: string | null = null): string | null {
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
      env: 'COMPOSIFY_UNZIP_DIR',
      default: false,
      allowNo: true,
    }),
  }

  async run() {
    const {flags} = this.parse(ItinerisltdComposify)
    const {name, type, vendor, zip} = flags
    const directory = flags.directory || name
    const file = flags.file || `${name}.php`
    const repo = flags.repo || `https://github.com/${vendor}/${name}.git`
    const unzipSubdir = flags.unzipSubdir ? `/${directory}` : ''

    const emptyTemporaryDirectories = new Listr([
      {
        title: `Empty ${zipWorkingDir}`,
        task: () => fs.emptyDirSync(zipWorkingDir),
      },
      {
        title: `Empty ${gitReadOnlyDir}`,
        task: () => fs.emptyDirSync(gitReadOnlyDir),
      },
      {
        title: `Empty ${zipWorkingDir}`,
        task: () => fs.emptyDirSync(gitWorkingDir),
      },
    ], {concurrent: true})

    const fetchPluginFiles = new Listr([
      {
        title: `wget ${zip} -O ${zipWorkingDir}/composify.zip`,
        // tslint:disable-next-line
        enabled: () => zip.startsWith('https://') || zip.startsWith('http://'),
        // tslint:disable-next-line
        task: async () => await execa('wget', [zip, '-O', `${zipWorkingDir}/composify.zip`]),
      },
      {
        title: `Copy ${zip} to ${zipWorkingDir}/composify.zip`,
        // tslint:disable-next-line
        enabled: () => ! (zip.startsWith('https://') || zip.startsWith('http://')),
        task: () => fs.copySync(zip, `${zipWorkingDir}/composify.zip`),
      },
      {
        title: `unzip -o ${zipWorkingDir}/composify.zip -d ${zipWorkingDir}${unzipSubdir}`,
        // tslint:disable-next-line
        task: async () => await execa('unzip', ['-o', `${zipWorkingDir}/composify.zip`, '-d', `${zipWorkingDir}${unzipSubdir}`]),
      },
      {
        title: `Read main plugin file ${zipWorkingDir}/${directory}/${file}`,
        task: ctx => ctx.mainPluginFile = fs.readFileSync(`${zipWorkingDir}/${directory}/${file}`, 'utf8'),
      },
    ])

    const parsePluginInformation = new Listr([
      {
        title: 'Parse version',
        task: ctx => {
          ctx.version = parsePluginHeader(ctx.mainPluginFile, 'Version')
          if (ctx.version === null) {
            throw new Error('version not found')
          }
        },
      },
      {
        title: 'Parse license',
        task: ctx => ctx.license = parsePluginHeader(ctx.mainPluginFile, 'License', 'proprietary'),
      },
      {
        title: 'Parse description',
        task: ctx => ctx.description = parsePluginHeader(ctx.mainPluginFile, 'Description', `Composified by @itinerisltd/composify from ${zip}`),
      },
    ], {concurrent: true})

    const fetchGitRepository = new Listr([
      {
        title: `git clone ${repo} ${gitReadOnlyDir}`,
        // tslint:disable-next-line
        task: async () => await execa('git', ['clone', repo, gitReadOnlyDir]),
      },
      {
        title: 'git fetch --tags',
        // tslint:disable-next-line
        task: async () => await execa('git', ['fetch', '--tags'], {cwd: gitReadOnlyDir}),
      },
      {
        title: 'Check version not yet tagged on git remote',
        task: async (ctx, task) => {
          task.title = `git show-ref --tags --quiet --verify -- refs/tags/${ctx.version}`
          const result = await execa('git', ['show-ref', '--tags', '--quiet', '--verify', '--', `refs/tags/${ctx.version}`], {cwd: gitReadOnlyDir}).catch(err => err)
          if (result.code === 0) {
            throw new Error('version already tagged on git remote')
          }
        }
      },
    ])

    const overwriteGitRepositoryWithPluginFiles = new Listr([
      {
        title: `Copy ${zipWorkingDir}/${directory} to ${gitWorkingDir}`,
        task: () => fs.copySync(`${zipWorkingDir}/${directory}`, gitWorkingDir),
      },
      {
        title: `Remove ${gitWorkingDir}/.git`,
        task: () => fs.removeSync(`${gitWorkingDir}/.git`),
      },
      {
        title: `Copy ${gitReadOnlyDir}/.git to ${gitWorkingDir}/.git`,
        task: () => fs.copySync(`${gitReadOnlyDir}/.git`, `${gitWorkingDir}/.git`),
      },
      {
        title: 'Generate composer.json',
        task: ctx => {
          const composer = {
            name: `${vendor}/${name}`,
            description: ctx.description,
            type,
            license: ctx.license,
            require: {
              'composer/installers': '^1.6',
            },
            extra: {
              composify: {
                zip,
                file,
                version: ctx.version,
                'build-at': new Date().toISOString(),
              }
            }
          }
          fs.outputJsonSync(`${gitWorkingDir}/composer.json`, composer, {
            spaces: 2,
          })
        },
      },
    ])

    const commitAndPush = new Listr([
      {
        title: 'git add -A',
        // tslint:disable-next-line
        task: async () => await execa('git', ['add', '-A'], {cwd: gitWorkingDir}),
      },
      {
        title: 'Commit latest plugin files',
        task: async (ctx, task) => {
          task.title = `git commit -m Version bump ${ctx.version}'`
          await execa('git', ['commit', '-m', `Version bump ${ctx.version}`], {cwd: gitWorkingDir})
        },
      },
      {
        title: 'Tag latest version',
        task: async (ctx, task) => {
          task.title = `git tag -a ${ctx.version} -m 'Version bump ${ctx.version} by @itinerisltd/composify'`
          await execa('git', ['tag', '-a', ctx.version, '-m', `Version bump ${ctx.version} by @itinerisltd/composify`], {cwd: gitWorkingDir})
        },
      },
      {
        title: 'git push --follow-tags origin master',
        // tslint:disable-next-line
        task: async () => await execa('git', ['push', '--follow-tags', 'origin', 'master'], {cwd: gitWorkingDir}),
      },
    ])

    const tasks = new Listr([
      {
        title: 'Empty temporary directories',
        task: () => emptyTemporaryDirectories,
      },
      {
        title: 'fetch plugin files',
        task: () => fetchPluginFiles,
      },
      {
        title: 'Parse plugin information',
        task: () => parsePluginInformation,
      },
      {
        title: 'Fetch git repository',
        task: () => fetchGitRepository,
      },
      {
        title: 'Overwrite git repository with plugin files',
        task: () => overwriteGitRepositoryWithPluginFiles,
      },
      {
        title: 'Commit and push',
        task: () => commitAndPush,
      },
    ])

    tasks.run()
      .catch(() => {}) // Ensure tempDir got cleaned up
      // tslint:disable-next-line:no-floating-promises
      .then(() => fs.removeSync(tempDir))
  }
}

export = ItinerisltdComposify
