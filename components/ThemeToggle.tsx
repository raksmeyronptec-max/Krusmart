"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Ensure hydration matches server
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the documented next-themes hydration guard: render the fallback until mounted
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button className="p-2 text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-gray-800 rounded-lg transition-colors">
        <Sun className="w-5 h-5 opacity-0" />
      </button>
    )
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2 text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-gray-800 rounded-lg hover:bg-blue-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-gray-700"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Moon className="w-5 h-5" />
      ) : (
        <Sun className="w-5 h-5" />
      )}
    </button>
  )
}
