import React, { useState, useRef } from 'react'
import { TtsClient } from '@/lib/tts/client'
import type { SynthesisMode } from '@/workers/protocol'

export function TtsPanel() {
  const [client] = useState(() => new TtsClient())
  const [text, setText] = useState('')
  const [phonemes, setPhonemes] = useState('')
  const [mode, setMode] = useState<SynthesisMode>('normal')
  const [pace, setPace] = useState(1)
  const [voiceId, setVoiceId] = useState('default')
  const [status, setStatus] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handleInit = async () => {
    setStatus('در حال بارگذاری مدل...')
    try {
      await client.init()
      setStatus('مدل بارگذاری شد')
    } catch (error) {
      setStatus(`خطا: ${(error as Error).message}`)
    }
  }

  const handlePhonemize = async () => {
    setStatus('در حال فونم‌سازی...')
    try {
      const result = await client.phonemize(text, mode)
      setPhonemes(result)
      setStatus('فونم‌سازی انجام شد')
    } catch (error) {
      setStatus(`خطا: ${(error as Error).message}`)
    }
  }

  const handleSynthesizeText = async () => {
    setStatus('در حال تولید صدا...')
    setProgress(null)
    try {
      const result = await client.synthesizeText(
        text,
        voiceId,
        mode,
        pace,
        (done, total) => setProgress({ done, total }),
      )
      const blob = new Blob([result.audio], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.src = url
        audioRef.current.play()
      }
      setStatus('صدا تولید شد')
    } catch (error) {
      setStatus(`خطا: ${(error as Error).message}`)
    }
  }

  const handleSynthesizePhonemes = async () => {
    setStatus('در حال تولید صدا از فونم...')
    try {
      const audio = await client.synthesizePhonemes(phonemes, voiceId, pace)
      const blob = new Blob([audio], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.src = url
        audioRef.current.play()
      }
      setStatus('صدا تولید شد')
    } catch (error) {
      setStatus(`خطا: ${(error as Error).message}`)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium">متن فارسی</label>
        <textarea
          className="w-full rounded border p-2"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="متن را اینجا وارد کنید..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium">فونم</label>
        <textarea
          className="w-full rounded border p-2"
          rows={2}
          value={phonemes}
          onChange={(e) => setPhonemes(e.target.value)}
          placeholder="فونم لاتین..."
        />
      </div>

      <div className="flex gap-4">
        <div>
          <label className="block text-sm font-medium">حالت</label>
          <select
            className="rounded border p-2"
            value={mode}
            onChange={(e) => setMode(e.target.value as SynthesisMode)}
          >
            <option value="normal">عادی</option>
            <option value="pack">فشرده</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">سرعت</label>
          <input
            type="number"
            className="w-24 rounded border p-2"
            min={0.5}
            max={2}
            step={0.1}
            value={pace}
            onChange={(e) => setPace(parseFloat(e.target.value))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">صدا</label>
          <input
            type="text"
            className="w-32 rounded border p-2"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={handleInit}>
          بارگذاری مدل
        </button>
        <button className="rounded bg-gray-600 px-4 py-2 text-white" onClick={handlePhonemize}>
          فونم‌سازی
        </button>
        <button className="rounded bg-green-600 px-4 py-2 text-white" onClick={handleSynthesizeText}>
          تولید از متن
        </button>
        <button className="rounded bg-purple-600 px-4 py-2 text-white" onClick={handleSynthesizePhonemes}>
          تولید از فونم
        </button>
      </div>

      {progress && (
        <div className="w-full rounded bg-gray-200">
          <div
            className="h-2 rounded bg-blue-600"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
          <p className="text-sm">
            {progress.done} از {progress.total} جمله
          </p>
        </div>
      )}

      {status && <p className="text-sm text-gray-700">{status}</p>}

      <audio ref={audioRef} controls className="w-full" />
    </div>
  )
}
