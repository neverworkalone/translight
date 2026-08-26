import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const FORBIDDEN_PACKAGE_PATHS = [
  /^(src|tests|node_modules|\.git)(\/|$)/,
  /(^|\/)(package\.json|package-lock\.json|vite\.config\.js|vite\.content\.config\.js|pack\.sh|pack\.py)$/,
  /(^|\/)\.DS_Store$/,
  /(^|\/)favicon\.ico$/,
  /\.map$/,
]

function normalizeEntry(value) {
  return String(value)
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
}

function addManifestPath(paths, value) {
  if (typeof value === 'string' && value && !value.includes('*')) {
    paths.add(normalizeEntry(value))
  }
}

export function collectManifestFiles(manifest) {
  const files = new Set(['manifest.json'])

  Object.values(manifest.icons || {}).forEach(value => addManifestPath(files, value))
  addManifestPath(files, manifest.options_page)
  addManifestPath(files, manifest.options_ui?.page)
  addManifestPath(files, manifest.action?.default_popup)
  addManifestPath(files, manifest.background?.service_worker)

  for (const contentScript of manifest.content_scripts || []) {
    for (const file of contentScript.js || []) addManifestPath(files, file)
    for (const file of contentScript.css || []) addManifestPath(files, file)
  }

  for (const ruleResource of manifest.declarative_net_request?.rule_resources || []) {
    addManifestPath(files, ruleResource.path)
  }

  for (const resourceGroup of manifest.web_accessible_resources || []) {
    for (const file of resourceGroup.resources || []) addManifestPath(files, file)
  }

  return files
}

function listFiles(root, current = root) {
  const files = []
  for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
    const absolutePath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFiles(root, absolutePath))
    } else if (entry.isFile()) {
      files.push(normalizeEntry(path.relative(root, absolutePath)))
    }
  }
  return files
}

function missingAndExtra(expected, actual) {
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  return {
    missing: [...expectedSet].filter(file => !actualSet.has(file)).sort(),
    extra: [...actualSet].filter(file => !expectedSet.has(file)).sort(),
  }
}

function packageForbiddenFiles(files) {
  return files.filter(file => FORBIDDEN_PACKAGE_PATHS.some(pattern => pattern.test(file))).sort()
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function addBuildFiles(files, actualFiles) {
  for (const file of actualFiles) {
    if (
      file.startsWith('assets/') ||
      file.startsWith('chunks/') ||
      file.startsWith('_locales/') ||
      /^icon(?:-[^/]+)?\d+\.png$/.test(file) ||
      file === 'icon.png'
    ) {
      files.add(file)
    }
  }
}

export function validatePackageDirectory({packageDir}) {
  const errors = []
  const manifestPath = path.join(packageDir, 'manifest.json')
  const actualFiles = fs.existsSync(packageDir) ? listFiles(packageDir) : []

  if (!fs.existsSync(manifestPath)) {
    return {
      errors: [`Missing ${path.relative(packageDir, manifestPath)}.`],
      actualFiles,
      expectedFiles: [],
    }
  }

  let manifest
  try {
    manifest = readJson(manifestPath)
  } catch (error) {
    return {
      errors: [`Manifest is not valid JSON: ${error.message}`],
      actualFiles,
      expectedFiles: [],
    }
  }

  const expectedFiles = collectManifestFiles(manifest)
  addBuildFiles(expectedFiles, actualFiles)

  const differences = missingAndExtra(expectedFiles, actualFiles)
  if (differences.missing.length > 0) {
    errors.push(`Manifest/build files missing from package: ${differences.missing.join(', ')}`)
  }
  if (differences.extra.length > 0) {
    errors.push(`Unexpected files found in package: ${differences.extra.join(', ')}`)
  }

  const forbidden = packageForbiddenFiles(actualFiles)
  if (forbidden.length > 0) {
    errors.push(`Development or unnecessary files found in package: ${forbidden.join(', ')}`)
  }

  const packageJsonPath = path.join(path.dirname(packageDir), 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    const packageVersion = String(readJson(packageJsonPath).version || '')
    const manifestVersion = String(manifest.version || '')
    if (!manifestVersion || !packageVersion.startsWith(`${manifestVersion}.`)) {
      errors.push(`Version mismatch: manifest ${manifestVersion || '(missing)'} vs package ${packageVersion || '(missing)'}.`)
    }
  }

  return {
    errors,
    actualFiles,
    expectedFiles: [...expectedFiles].sort(),
    manifest,
  }
}

function listZipFiles(zipPath) {
  execFileSync('unzip', ['-t', zipPath], {stdio: 'ignore'})
  return execFileSync('unzip', ['-Z1', zipPath], {encoding: 'utf8'})
    .split(/\r?\n/)
    .map(normalizeEntry)
    .filter(file => file && !file.endsWith('/'))
}

export function validatePackageZip({packageDir, zipPath, packageFiles, manifestVersion}) {
  const errors = []
  let zipFiles

  try {
    zipFiles = listZipFiles(zipPath)
  } catch (error) {
    return {errors: [`ZIP could not be read or tested: ${error.message}`], zipFiles: []}
  }

  const differences = missingAndExtra(packageFiles, zipFiles)
  if (differences.missing.length > 0) {
    errors.push(`ZIP is missing files from the unpacked build: ${differences.missing.join(', ')}`)
  }
  if (differences.extra.length > 0) {
    errors.push(`ZIP has files not present in the unpacked build: ${differences.extra.join(', ')}`)
  }

  const forbidden = packageForbiddenFiles(zipFiles)
  if (forbidden.length > 0) {
    errors.push(`Development or unnecessary files found in ZIP: ${forbidden.join(', ')}`)
  }

  const expectedName = `${path.basename(path.dirname(packageDir))}_${manifestVersion}.zip`
  if (path.basename(zipPath) !== expectedName) {
    errors.push(`ZIP name mismatch: expected ${expectedName}, received ${path.basename(zipPath)}.`)
  }

  return {errors, zipFiles}
}

export function validatePackage({projectRoot, packageDir, zipPath}) {
  const directoryResult = validatePackageDirectory({packageDir})
  const errors = [...directoryResult.errors]
  let zipResult = {errors: [], zipFiles: []}

  if (zipPath && directoryResult.errors.length === 0) {
    zipResult = validatePackageZip({
      packageDir,
      zipPath,
      packageFiles: directoryResult.actualFiles,
      manifestVersion: directoryResult.manifest.version,
    })
    errors.push(...zipResult.errors)
  }

  return {...directoryResult, ...zipResult, errors}
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

function main() {
  const args = process.argv.slice(2)
  const projectRoot = path.resolve(optionValue(args, '--project-root', process.cwd()))
  const packageDir = path.resolve(optionValue(args, '--dir', path.join(projectRoot, 'dist')))
  const zipOption = optionValue(args, '--zip', '')
  const result = validatePackage({
    projectRoot,
    packageDir,
    zipPath: zipOption ? path.resolve(zipOption) : null,
  })

  if (result.errors.length > 0) {
    console.error(result.errors.map(error => `- ${error}`).join('\n'))
    process.exitCode = 1
    return
  }

  const zipSummary = zipOption ? ` and ZIP (${result.zipFiles.length} files)` : ''
  console.log(`Package validation passed: ${result.actualFiles.length} unpacked files${zipSummary}.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main()
}
