import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

const source = path.resolve('node_modules/onnxruntime-web/dist')
const target = path.resolve('public', 'ort')

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })

const files = (await readdir(source)).filter((name) => /^ort-wasm.*\.(mjs|wasm)$/.test(name))
if (files.length === 0) {
  throw new Error(`No ONNX Runtime WASM assets found in ${source}`)
}

await Promise.all(files.map((file) => cp(path.join(source, file), path.join(target, file))))
console.log(`Copied ${files.length} ONNX Runtime files to public/ort`)
