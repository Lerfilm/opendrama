"use client"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CARD_RARITIES, CardRarity } from "@/lib/cards"
import { Sparkles } from "lucide-react"

interface CardDropModalProps {
  card: {
    id: string
    name: string
    rarity: string
    imageUrl: string
    quantity: number
  }
  open: boolean
  onClose: () => void
}

export function CardDropModal({ card, open, onClose }: CardDropModalProps) {
  const rarityInfo = CARD_RARITIES[card.rarity as CardRarity]

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <div className="text-center py-6">
          <div className="mb-4">
            <Sparkles className="w-12 h-12 text-yellow-500 mx-auto animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold mb-4">恭喜获得卡牌！</h2>

          <div
            className={`relative rounded-lg overflow-hidden border-4 ${rarityInfo?.borderColor} mb-4`}
          >
            <img
              src={card.imageUrl}
              alt={card.name}
              className="w-full aspect-[3/4] object-cover"
            />
            <div className="absolute top-2 right-2">
              <Badge className={rarityInfo?.color}>
                {rarityInfo?.emoji} {rarityInfo?.name}
              </Badge>
            </div>
          </div>

          <h3 className="text-xl font-bold mb-2">{card.name}</h3>
          <p className="text-muted-foreground mb-4">
            已拥有 x{card.quantity}
          </p>

          <Button onClick={onClose} className="w-full" size="lg">
            继续观看
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
