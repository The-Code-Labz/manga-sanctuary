import { Star } from "lucide-react";

interface StarRatingProps {
  rating: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onRate?: (rating: number) => void;
}

const sizes = { sm: "h-3.5 w-3.5", md: "h-4.5 w-4.5", lg: "h-5.5 w-5.5" };

export default function StarRating({ rating, max = 5, size = "md", interactive, onRate }: StarRatingProps) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => {
        const filled = i < Math.round(rating);
        return (
          <button
            key={i}
            type="button"
            disabled={!interactive}
            onClick={() => onRate?.(i + 1)}
            className={`transition-all duration-200 ${interactive ? "cursor-pointer hover:scale-125" : "cursor-default"}`}
          >
            <Star
              className={`${sizes[size]} transition-colors duration-200 ${
                filled
                  ? "fill-golden text-golden drop-shadow-[0_0_4px_hsl(45,100%,60%,0.4)]"
                  : "text-muted-foreground/20"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}