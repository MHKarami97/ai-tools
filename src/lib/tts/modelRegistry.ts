export interface ModelFile {
  readonly name: string
  readonly url: string
}

const ONNX_REPO = 'Nimaone/pocket-tts-farsi-v2-onnx'
const TOKENIZER_REPO = 'mehdi-hf/pocket-tts-farsi-v2'
const BRANCH = 'main'
const TOKENIZER_FILE_NAME = 'tokenizer_ph.model'

const ONNX_FILE_NAMES: readonly string[] = [
  'manifest.json',
  'flow_lm_step.onnx',
  'flow_lm_step.onnx.data',
  'mimi_encoder.onnx',
  'mimi_encoder.onnx.data',
  'mimi_decoder_step_kv.onnx',
  'mimi_decoder_step_kv.onnx.data',
  'g2p_encoder.onnx',
  'g2p_decoder.onnx',
  'g2p_decoder.onnx.data',
  'weights.npz',
  'decode_state_init.npz',
]

function remoteUrl(repo: string, name: string): string {
  return `https://huggingface.co/${repo}/resolve/${BRANCH}/${name}`
}

export const MODEL_FILES: readonly ModelFile[] = [
  ...ONNX_FILE_NAMES.map((name) => ({ name, url: remoteUrl(ONNX_REPO, name) })),
  { name: TOKENIZER_FILE_NAME, url: remoteUrl(TOKENIZER_REPO, TOKENIZER_FILE_NAME) },
]