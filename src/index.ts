import {Command, flags} from '@oclif/command'
import * as execa from 'execa'
import * as fs from 'fs-extra'

class ItinerisltdComposify extends Command {
  static description = 'describe the command here'

  static flags = {
    // add --version flag to show CLI version
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
    zip: flags.string({
      char: 'z',
      description: 'url to the latest zip file [example: https://kinsta.com/kinsta-tools/kinsta-mu-plugins.zip]',
      required: true,
    }),
    repo: flags.string({
      char: 'r',
      description: 'url to the latest zip file [example: https://github.com/ItinerisLtd/kinsta-mu-plugins.git]',
    }),
    file: flags.string({
      char: 'f',
      description: 'main plugin file which containing the plugin header comment [example: kinsta-mu-plugins.php]',
    }),
    directory: flags.string({
      char: 'd',
      description: 'plugin directory name after unzip [example: kinsta-mu-plugins]',
    }),
    name: flags.string({
      char: 'n',
      description: 'package name [example: kinsta-mu-plugins]',
      required: true,
    }),
    vendor: flags.string({
      char: 'o',
      description: 'vender / organization name [example: itinerisltd]',
      required: true,
    }),
    type: flags.string({
      char: 't',
      description: 'package type',
      options: ['wordpress-plugin', 'wordpress-muplugin'],
      default: 'wordpress-plugin',
      required: true,
    }),
    unzipDir: flags.string({
      char: 'u',
      description: 'unzip file to this directory, only use when default is breking [example: kinsta-mu-plugins]',
    }),
  }

  async run() {
    const {flags} = this.parse(ItinerisltdComposify)
    const {name, type, vendor, zip} = flags
    const directory = flags.directory || name
    const file = flags.file || `${name}.php`
    const repo = flags.repo || `https://github.com/${vendor}/${name}.git`
    const unzipDir = flags.unzipDir ? `/${flags.unzipDir}` : ''

    const zipWorkingDir = 'tmp/zip/working'

    fs.emptyDirSync(zipWorkingDir)
    await execa('wget', [zip, '-O', `${zipWorkingDir}/composify.zip`])
    await execa('unzip', ['-o', `${zipWorkingDir}/composify.zip`, '-d', `${zipWorkingDir}${unzipDir}`])

    const plugin = fs.readFileSync(`${zipWorkingDir}/${directory}/${file}`, 'utf8')
    const versionRegex = new RegExp(/^[\s\*\#\@]*Version\:(.*)$/, 'mi')
    const versionMatch = versionRegex.exec(plugin)
    if (versionMatch === null) {
      throw new Error('version not found')
    }
    const version = versionMatch[1].trim() + 'beta1000000'

    const licenseRegex = new RegExp(/^[\s\*\#\@]*License\:(.*)$/, 'mi')
    const licenseMatch = licenseRegex.exec(plugin)
    let license = 'proprietary'
    if (licenseMatch !== null) {
      license = licenseMatch[1].trim()
    }

    const descriptionRegex = new RegExp(/^[\s\*\#\@]*Description\:(.*)$/, 'mi')
    const descriptionMatch = descriptionRegex.exec(plugin)
    let description = `Composified by @itinerisltd/composify from ${zip}`
    if (descriptionMatch !== null) {
      description = descriptionMatch[1].trim()
    }

    const gitReadOnlyDir = 'tmp/git/read-only'
    fs.emptyDirSync(gitReadOnlyDir)
    await execa('git', ['clone', repo, gitReadOnlyDir])
    await execa('git', ['fetch', '--tags'], {cwd: gitReadOnlyDir})
    const result = await execa('git', ['show-ref', '--tags', '--quiet', '--verify', '--', `refs/tags/${version}`], {cwd: gitReadOnlyDir})
                           .catch(err => err)
    const isTagExists = result.code === 0
    if (isTagExists) {
      throw new Error('version already tagged on git remote')
    }

    const gitWorkingDir = 'tmp/git/working'
    fs.emptyDirSync(gitWorkingDir)
    fs.copySync(`${zipWorkingDir}/${directory}`, gitWorkingDir)
    fs.removeSync(`${gitWorkingDir}/.git`)
    fs.copySync(`${gitReadOnlyDir}/.git`, `${gitWorkingDir}/.git`)

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
    fs.outputJsonSync(`${gitWorkingDir}/composer.json`, composer, {
      spaces: 2,
    })

    await execa('git', ['add', '-A'], {cwd: gitWorkingDir})
    await execa('git', ['commit', '-m', `Version bump ${version}`], {cwd: gitWorkingDir})
    await execa('git', ['tag', '-a', version, '-m', `Version bump ${version} by @itinerisltd/composify`], {cwd: gitWorkingDir})
    await execa('git', ['push', 'origin', 'master', '--follow-tags'], {cwd: gitWorkingDir})

    fs.removeSync('tmp')
  }
}

export = ItinerisltdComposify
