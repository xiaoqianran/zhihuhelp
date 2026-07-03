const fs = require('fs')
const path = require('path')

const vctoolsVersion = process.env.VCToolsVersion || '14.40.33807'
const gypiPath = path.join(__dirname, '..', 'node_modules', 'sqlite3', 'deps', 'common-sqlite.gypi')

if (!fs.existsSync(gypiPath)) {
  console.error('sqlite3 not installed, run npm install first')
  process.exit(1)
}

let content = fs.readFileSync(gypiPath, 'utf8')
content = content.replace(/'VCToolsVersion': '[^']+'/g, `'VCToolsVersion': '${vctoolsVersion}'`)

const block = `        'msvs_configuration_attributes': {
          'VCToolsVersion': '${vctoolsVersion}',
        }`

if (!content.includes("'msvs_configuration_attributes'")) {
  const patched = content.replace(
    /('msvs_settings': \{\s*'VCCLCompilerTool': \{\s*'ExceptionHandling': 1, # \/EHsc\s*\}\s*\})/g,
    `$1,\n${block}`,
  )
  if (patched === content) {
    console.error('failed to patch sqlite3 gypi')
    process.exit(1)
  }
  content = patched
}

fs.writeFileSync(gypiPath, content)
console.log(`sqlite3 MSVC toolset locked to ${vctoolsVersion}`)