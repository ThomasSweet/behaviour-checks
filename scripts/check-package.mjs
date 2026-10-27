import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const { devDependencies, peerDependencies } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const playwright = process.env.PLAYWRIGHT_VERSION || peerDependencies['@playwright/test'].replace(/^>=/, '')
const scratch = mkdtempSync(join(tmpdir(), 'checks-consumer-'))

function run(command, args, cwd = scratch) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

try {
  let tarball = process.argv[2] && resolve(process.argv[2])
  if (!tarball) {
    run('npm', ['pack', '--pack-destination', scratch], root)
    tarball = join(scratch, readdirSync(scratch).find((name) => name.endsWith('.tgz')))
  }
  cpSync(join(root, 'tests/consumer'), scratch, { recursive: true })
  cpSync(join(root, '.npmrc'), join(scratch, '.npmrc'))
  writeFileSync(join(scratch, 'package.json'), JSON.stringify({ private: true }, null, 2))
  console.log(`Node ${process.version}`)
  run('npm', [
    'install',
    '--no-audit',
    '--no-fund',
    tarball,
    `@playwright/test@${playwright}`,
    `typescript@${devDependencies.typescript}`,
  ])
  run('npx', ['playwright', '--version'])
  run('npx', ['playwright', 'install', ...(process.env.CI ? ['--with-deps'] : []), 'chromium'])
  run('npx', ['tsc', '-p', '.'])
  run('npx', ['playwright', 'test'])
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
