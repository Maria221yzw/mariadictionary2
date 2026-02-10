import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { WordFormData } from "@/pages/SearchPage";

interface Props {
  form: WordFormData;
  defaultOpen?: boolean;
}

export default function WordFormSection({ form, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-card rounded-xl shadow-warm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-mono font-semibold">
            {form.pos}
          </span>
          <span className="text-base font-display font-semibold text-foreground truncate">
            {form.word}
          </span>
          {form.phonetic && (
            <span className="text-xs font-mono text-muted-foreground hidden sm:inline">{form.phonetic}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted-foreground max-w-[140px] truncate hidden sm:inline">{form.meaningCn}</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              {/* Chinese definition */}
              <p className="text-sm text-foreground font-medium">{form.meaningCn}</p>

              {/* Morphologies */}
              {form.morphologies && form.morphologies.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.morphologies.map((m, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted rounded-lg px-2.5 py-1">
                      <span className="text-muted-foreground">{m.typeCn}</span>
                      <span className="font-mono font-medium text-foreground">{m.form}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Example sentence */}
              {form.example && (
                <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                  <p className="text-sm text-foreground leading-relaxed italic">"{form.example.sentence}"</p>
                  <p className="text-xs text-muted-foreground">{form.example.translation}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
