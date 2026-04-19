'use client'

import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Lock } from 'lucide-react'

interface DemoModalProps {
  open: boolean
  onClose: () => void
}

export function DemoModal({ open, onClose }: DemoModalProps) {
  const router = useRouter()

  function handleSignUp() {
    onClose()
    router.push('/login?mode=signup')
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Lock className="h-6 w-6 text-amber-400" />
            </div>
          </div>
          <DialogTitle className="text-center">Demo Mode</DialogTitle>
          <DialogDescription className="text-center">
            You are browsing a demo account. Create a free account to add your own data, track your finances, and more.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={handleSignUp} className="w-full">
            Create Free Account
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full text-muted-foreground">
            Continue Browsing Demo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
