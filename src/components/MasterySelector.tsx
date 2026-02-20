import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MASTERY_COLORS: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-yellow-500",
  4: "bg-emerald-400",
  5: "bg-emerald-600",
};
const MASTERY_LABELS: Record<number, string> = {
  1: "陌生", 2: "模糊", 3: "认知", 4: "运用", 5: "熟练",
};

interface MasterySelectorProps {
  vocabId: string;
  currentLevel: number;
  onUpdate?: (newLevel: number) => void;
  size?: "sm" | "md";
}

export default function MasterySelector({ vocabId, currentLevel, onUpdate, size = "md" }: MasterySelectorProps) {
  const [updating, setUpdating] = useState<number | null>(null);

  const handleSelect = async (level: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (level === currentLevel || updating !== null) return;
    setUpdating(level);
    try {
      const { error } = await supabase
        .from("vocab_table")
        .update({ mastery_level: level })
        .eq("id", vocabId);
      if (error) throw error;
      toast.success(`掌握程度已更新为「${MASTERY_LABELS[level]}」`);
      onUpdate?.(level);
    } catch (e) {
      console.error(e);
      toast.error("更新失败，请重试");
    } finally {
      setUpdating(null);
    }
  };

  const dotSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const containerClass = size === "sm" ? "gap-1" : "gap-1.5";

  return (
    <div
      className={`flex items-center ${containerClass}`}
      title="点击调整掌握程度"
      onClick={(e) => e.stopPropagation()}
    >
      {([1, 2, 3, 4, 5] as const).map(level => (
        <button
          key={level}
          onClick={(e) => handleSelect(level, e)}
          disabled={updating !== null}
          title={`L${level} · ${MASTERY_LABELS[level]}`}
          className={`
            ${dotSize} rounded-full transition-all duration-150
            ${MASTERY_COLORS[level]}
            ${level === currentLevel
              ? "ring-2 ring-offset-1 ring-offset-card ring-current scale-110"
              : "opacity-30 hover:opacity-70"
            }
            ${updating === level ? "animate-pulse" : ""}
            disabled:cursor-wait
          `}
        />
      ))}
    </div>
  );
}
