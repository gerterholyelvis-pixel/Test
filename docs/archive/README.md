# Archive

Old material kept for reference, out of the main tree. Nothing in the game, the tests or the current docs links here.

- `screens/`: 309 screenshots from earlier work (before/after shots, perf runs, QA passes) that no document references any more. They were moved here from `docs/screens/` on 2026-10-16 (release pass, docs/RELEASE.md). `docs/screens/` keeps only the screenshots a doc links to.
- `i_wheel.png`: a stray capture of the goblin wheel that sat at the repository root.

Policy (docs/RELEASE.md, "Repo hygiene"):
- New screenshots go to `docs/screens/` only when a doc links them. Throwaway captures go to a scratch folder outside the repo.
- Moving files does not shrink the Git history (`.git` is about 69 MB, most of it images). Removing them from history needs a history rewrite (`git filter-repo`) and a force push. That is the owner's call, see docs/RELEASE.md.
