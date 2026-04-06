// useSync.js — loads and saves all app state to Supabase
// All data is stored in a single "app_state" table as JSON blobs
// keyed by name: "compounds", "schedule", "inventory"
import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

const KEYS = ['compounds', 'schedule', 'inventory']

async function loadAll() {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('app_state')
    .select('key, value')
    .in('key', KEYS)
  if (error) { console.error('Supabase load error:', error); return null }
  const result = {}
  data.forEach(row => { result[row.key] = row.value })
  return result
}

async function saveKey(key, value) {
  if (!supabase) return
  const { error } = await supabase
    .from('app_state')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) console.error(`Supabase save error (${key}):`, error)
}

export function useSync(defaults) {
  const [data, setData] = useState(defaults)
  const [status, setStatus] = useState('loading') // loading | live | offline
  const saveTimers = useRef({})

  // Load on mount
  useEffect(() => {
    if (!supabase) { setStatus('offline'); return }
    loadAll().then(remote => {
      if (remote) {
        setData(d => ({
          compounds:  remote.compounds  ?? d.compounds,
          schedule:   remote.schedule   ?? d.schedule,
          inventory:  remote.inventory  ?? d.inventory,
        }))
        setStatus('live')
      } else {
        setStatus('offline')
      }
    })
  }, [])

  // Real-time subscription — when another user saves, we get the update
  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel('app_state_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, payload => {
        const { key, value } = payload.new
        if (KEYS.includes(key)) {
          setData(d => ({ ...d, [key]: value }))
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  // Debounced save whenever data changes
  const update = (key, value) => {
    setData(d => ({ ...d, [key]: value }))
    clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(() => saveKey(key, value), 800)
  }

  return { data, update, status }
}
