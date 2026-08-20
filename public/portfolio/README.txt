PORTFOLIO — USER-EDIT PRESERVED + TEXT SPACING FIX

This package uses the user's manually edited index(1).html as the source.
The HTML content and manually inserted line breaks/split <p> elements were
not rewritten.

Files:
- index.html  — user's edited portfolio, renamed for normal loading
- style.css   — existing stylesheet plus a final text-spacing override
- app.js      — existing navigation script

Fix:
The manually split <p> elements are treated as visual lines rather than
separate paragraphs. Their margins are reset to zero, while labelled
sections retain controlled spacing.

Especially fixed:
- Face Recognition → Engineering Challenge
- Face Recognition → Takeaway
- Other project detail pages using manually split paragraphs
- Bottom-detail blocks
- Manually split About lead text

The existing embedded images and all user HTML changes are preserved.
