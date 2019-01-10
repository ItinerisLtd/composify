# composify

Turn WordPress plugin zip files into git repositories, so that composer version constraint could work properly.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@itinerisltd/composify.svg)](https://npmjs.org/package/@itinerisltd/composify)
[![Downloads/week](https://img.shields.io/npm/dw/@itinerisltd/composify.svg)](https://npmjs.org/package/@itinerisltd/composify)
[![License](https://img.shields.io/npm/l/@itinerisltd/composify.svg)](https://github.com/ItinerisLtd/composify/blob/master/package.json)
[![Hire Itineris](https://img.shields.io/badge/Hire-Itineris-ff69b4.svg)](https://www.itineris.co.uk/contact/)

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Goal](#goal)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Examples](#examples)
  - [Gravity Forms](#gravity-forms)
  - [Advanced Custom Fields Pro](#advanced-custom-fields-pro)
  - [Kinsta MU Plugins](#kinsta-mu-plugins)
- [FAQ](#faq)
  - [How to install the `composify`-ed plugin via `composer`?](#how-to-install-the-composify-ed-plugin-via-composer)
  - [Can I change default flag values via environment variables?](#can-i-change-default-flag-values-via-environment-variables)
  - [Can I install `composify` instead of using `$ npx`?](#can-i-install-composify-instead-of-using--npx)
  - [How about plugins on wordpress.org?](#how-about-plugins-on-wordpressorg)
  - [Is it a must to use `composify` with Bedrock?](#is-it-a-must-to-use-composify-with-bedrock)
  - [It looks awesome. Where can I find some more goodies like this?](#it-looks-awesome-where-can-i-find-some-more-goodies-like-this)
  - [This isn't on wp.org. Where can I give a ⭐️⭐️⭐️⭐️⭐️ review?](#this-isnt-on-wporg-where-can-i-give-a-%EF%B8%8F%EF%B8%8F%EF%B8%8F%EF%B8%8F%EF%B8%8F-review)
- [Feedback](#feedback)
- [Security](#security)
- [Change log](#change-log)
- [Credits](#credits)
- [License](#license)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Goal

Since plugin auothers do ususally provide custom composer repositories (e.g: [Private Packagist](https://packagist.com/), [satis](https://getcomposer.org/doc/articles/handling-private-packages-with-satis.md#satis)), installing premium WordPress plugins via `composer` is not easy.

[Lots](https://kinsta.com/blog/bedrock-trellis/) [of](https://gist.github.com/beaverbuilder/8ab6fd1f054582a1fe5ae053c3b75a55/e7ce9dd744255778583705b6da6cdce53a295506#file-composer-bb-theme-config-json) [tutorials](https://deliciousbrains.com/using-composer-manage-wordpress-themes-plugins/) teach you: open `composer.json` and add the following within the `repositories` array:
```json
// https://kinsta.com/blog/bedrock-trellis/
{
  "type": "package",
  "package": {
    "name": "kinsta/kinsta-mu-plugins",
    "type": "wordpress-muplugin",
    "version": "2.0.15",
    "dist": {
      "url": "https://kinsta.com/kinsta-tools/kinsta-mu-plugins.zip",
      "type": "zip"
    }
  }
}
```

The problems:
- if `package.dist.url` is *version-locked*, the `repositories` array has to be updated whenever new plugin version is released
- if `package.dist.url` is not *version-locked*,`$ composer install` is not deterministic (even with `composer.lock`)
  * `package.dist.url` always point to the latest version
  * `package.version` becomes meaningless because the downloaded zip couble be a newer version
  * running `$ composer install` (without changing anything) could break the site becuase a newer plugin version is installed
  * when composer caching invoked, there is no way to know which plugin version will be installed

The solution / what `composify` does:
1. download the plugin zip file
2. unzip it
3. generate `composer.json`
4. commit plugins files and `composer.json`
5. `$ git tag`
5. `$ git push --follow-tags`

## Requirements

- NodeJS v10.0.0 or later

## Installation

`$ npx @itinerisltd/composify` just work! No installation required.

## Usage

```sh-session
$ npx @itinerisltd/composify --help
describe the command here

USAGE
  $ composify

OPTIONS
  -d, --directory=directory                       directory name after unzip [example: kinsta-mu-plugins]

  -f, --file=file                                 main plugin file which containing the plugin header comment
                                                  [example: kinsta-mu-plugins.php]

  -h, --help                                      show CLI help

  -n, --name=name                                 (required) package name [example: kinsta-mu-plugins]

  -o, --vendor=vendor                             (required) vender / organization name [example: itinerisltd]

  -r, --repo=repo                                 url to the latest zip file [example:
                                                  https://github.com/ItinerisLtd/kinsta-mu-plugins.git]

  -t, --type=wordpress-plugin|wordpress-muplugin  (required) [default: wordpress-plugin] package type

  -u, --unzipDir=unzipDir                         unzip file to this directory, only use when default is breking
                                                  [example: kinsta-mu-plugins]

  -v, --version                                   show CLI version

  -z, --zip=zip                                   (required) url to the latest zip file [example:
                                                  https://kinsta.com/kinsta-tools/kinsta-mu-plugins.zip]
```

## Examples

### Gravity Forms

```sh-session
$ npx @itinerisltd/composify --vendor=itinerisltd --name=gravityforms --zip=<the-signed-s3-url>
```

Note the flags:
```sh-session
$ wget <the-signed-s3-url>
$ tree .
.
└── gravityforms_x.y.z.zip

$ unzip -o ./gravityforms_2.4.5.zip
$ tree .
.
├── gravityforms              <-- `--directory`
│   ├── gravityforms.php      <-- `--file`
│   ├── xxx
│   └── yyy.php
└── gravityforms_x.y.z.zip
```

* `--directory` is omitted because it defaults to `${name}`, i.e: `gravityforms`
* `--file` is omitted because it defaults to `${name}.php`, i.e: `gravityforms.php`
* `--repo` is omitted because it defaults to `https://github.com/${vendor}/${name}.git`
* `--unzipDir` is omitted because main plugin file is not inside a sub-directory

### Advanced Custom Fields Pro

```sh-session
$ npx @itinerisltd/composify --vendor=itinerisltd --name=advanced-custom-fields-pro --file=acf.php --zip=https://connect.advancedcustomfields.com/xxx
```

Note the flags:
```sh-session
$ wget https://connect.advancedcustomfields.com/xxx
$ tree .
.
└── advanced-custom-fields-pro.zip

$ unzip -o ./advanced-custom-fields-pro.zip
$ tree .
.
├── advanced-custom-fields-pro        <-- `--directory`
│   ├── acf.php                       <-- `--file`
│   ├── readme.txt
│   └── xxx
└── advanced-custom-fields-pro.zip
```

* `--file` is set to `acf.php`

### Kinsta MU Plugins

```sh-session
$ npx @itinerisltd/composify --vendor=itinerisltd --name=kinsta-mu-plugins --zip=https://kinsta.com/kinsta-tools/kinsta-mu-plugins.zip --unzipDir=kinsta-mu-plugins --type=wordpress-muplugin
```

Note the flags:
```sh-session
$ wget https://kinsta.com/kinsta-tools/kinsta-mu-plugins.zip
$ tree .
.
└── kinsta-mu-plugins.zip
$ unzip -o ./kinsta-mu-plugins.zip
$ tree .
.
├── kinsta-mu-plugins
│   ├── xxx
│   └── yyy
├── kinsta-mu-plugins.php    <-- `--file`
└── kinsta-mu-plugins.zip
```

* `--unzipDir` is set (ususally same as `--name` or `--directory`) because the unzipped content is not *contained* inside a `--directory`

## FAQ

### How to install the `composify`-ed plugin via `composer`?

Open `composer.json` and add your git remote into `repositories`:
```json
{
  "repositories": [
    {
      "type": "git",
      "url": "https://github.com/<vendor>/<name>"
    }
  ]
}
```

```sh-session
$ composer require <vendor>/<name>
```

See: https://getcomposer.org/doc/05-repositories.md#vcs

### Can I change default flag values via environment variables?

Yes.

These 2 commands are equivalent:
```sh-session
$ COMPOSIFY_VENDOR=itinerisltd COMPOSIFY_NAME=gravityforms COMPOSIFY_ZIP=<the-signed-s3-url> npx @itinerisltd/composify
$ npx @itinerisltd/composify --vendor=itinerisltd --name=gravityforms --zip=<the-signed-s3-url>
```

### Can I install `composify` instead of using `$ npx`?

Yes. However, you are responsible for updating it.

```sh-session
# yarn or npm doesn't matter
$ yarn global add @itinerisltd/composify
$ composify --vendor=itinerisltd --name=gravityforms --zip=<the-signed-s3-url>
```

### How about plugins on wordpress.org?

Use [WordPress Packagist](https://wpackagist.org/) instead.

### Is it a must to use `composify` with Bedrock?

No.

Although we prefer and sponsor [Bedrock](https://github.com/roots/bedrock/#bedrock-sponsors) at [Itineris](https://www.itineris.co.uk/), you can `composify` any plugin zip files into git repositories, and install them via [composer](https://getcomposer.org/doc/05-repositories.md#vcs).

Bedrock alternatives:
- [Composer in WordPress](https://composer.rarst.net/)
- [WP Starter](https://wecodemore.github.io/wpstarter/)

### It looks awesome. Where can I find some more goodies like this?

- Articles on [Itineris' blog](https://www.itineris.co.uk/blog/)
- More projects on [Itineris' GitHub profile](https://github.com/itinerisltd)
- Follow [@itineris_ltd](https://twitter.com/itineris_ltd) and [@TangRufus](https://twitter.com/tangrufus) on Twitter
- Hire [Itineris](https://www.itineris.co.uk/services/) to build your next awesome site

### This isn't on wp.org. Where can I give a ⭐️⭐️⭐️⭐️⭐️ review?

Thanks! Glad you like it. It's important to make my boss know somebody is using this project. Instead of giving reviews on wp.org, consider:

- tweet something good with mentioning [@itineris_ltd](https://twitter.com/itineris_ltd) and [@TangRufus](https://twitter.com/tangrufus)
- star this [Github repo](https://github.com/ItinerisLtd/composify)
- watch this [Github repo](https://github.com/ItinerisLtd/composify)
- write blog posts
- submit pull requests
- [hire Itineris](https://www.itineris.co.uk/services/)

## Feedback

**Please provide feedback!** We want to make this library useful in as many projects as possible.
Please submit an [issue](https://github.com/ItinerisLtd/composify/issues/new) and point out what you do and don't like, or fork the project and make suggestions.
**No issue is too small.**

## Security

If you discover any security related issues, please email [hello@itineris.co.uk](mailto:hello@itineris.co.uk) instead of using the issue tracker.

## Change log

Please see [CHANGELOG](./CHANGELOG.md) for more information on what has changed recently.

## Credits

[composify](https://github.com/ItinerisLtd/composify) is a [Itineris Limited](https://www.itineris.co.uk/) project created by [Tang Rufus](https://typist.tech).

Full list of contributors can be found [here](https://github.com/ItinerisLtd/composify/graphs/contributors).

## License

[composify](https://github.com/ItinerisLtd/composify) is released under the [MIT License](https://opensource.org/licenses/MIT).
