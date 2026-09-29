export interface ModelFile {
  readonly name: string
  readonly url: string
  readonly size: number
}

export interface ModelVersion {
  readonly version: string
  readonly files: ModelFile[]
}

export const MODEL_REPO = 'mhkarami97/pocket-tts-fa'
export const MODEL_BRANCH = 'main'

export const MODEL_FILES: ModelFile[] = [
  { name: 'constants.json', url: `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_BRANCH}/constants.json`, size: 256 },
  { name: 'flow.onnx', url: `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_BRANCH}/flow.onnx`, size: 45_000_000 },
  { name: 'encoder.onnx', url: `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_BRANCH}/encoder.onnx`, size: 8_000_000 },
  { name: 'decoder.onnx', url: `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_BRANCH}/decoder.onnx`, size: 35_000_000 },
  { name: 'weights.npz', url: `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_BRANCH}/weights.npz`, size: 60_000_000 },
  { name: 'decode_state_init.npz', url: `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_BRANCH}/decode_state_init.npz`, size: 2_000_000 },
  { name: 'sp.onnx', url: `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_BRANCH}/sp.onnx`, size: 1_500_000 },
  { name: 'g2p.onnx', url: `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_BRANCH}/g2p.onnx`, size: 500_000 },
]

export const TOTAL_SIZE = MODEL_FILES.reduce((sum, file) => sum + file.size, 0)
