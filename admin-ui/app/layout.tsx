import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { RootAuthProvider } from '@/components/AuthProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'BetterMark Admin',
  description: 'Admin Control Plane for BetterMark Agent System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <RootAuthProvider>
          {children}
        </RootAuthProvider>
      </body>
    </html>
  )
}
