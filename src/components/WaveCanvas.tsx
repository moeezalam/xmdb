import { useEffect, useRef } from 'react'
import { startWave } from '../lib/wave'

export function WaveCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const handle = startWave(c)
    return () => handle?.stop()
  }, [])
  return <canvas className="wave" ref={ref} />
}
