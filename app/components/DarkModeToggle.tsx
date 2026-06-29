'use client'

import { useEffect, useState } from 'react'
import styles from './DarkModeToggle.module.css'

export default function DarkModeToggle() {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    const isDark = saved ? saved === 'dark' : true
    setDark(isDark)
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <button className={styles.btn} onClick={toggle} title="Toggle dark mode">
      {dark ? '☀️' : '🌙'}
    </button>
  )
}
