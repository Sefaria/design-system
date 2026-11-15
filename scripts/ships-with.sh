#!/usr/bin/env bash
# Prints the product PR a design-system PR ships with, read from its "Ships with:" line, as
# "ai-chatbot#123" or "Sefaria-Project#123" (repo name normalized). Prints nothing for a standalone PR.
# Text inside HTML comments (<!-- -->, e.g. the PR template's instructions) is ignored.
# Usage: scripts/ships-with.sh "$PR_BODY"
# Plain bash, so it behaves the same on GitHub's runners and on macOS.
shopt -s nocasematch
in_comment=false
while IFS= read -r line; do
  visible=""
  while [[ -n "$line" ]]; do
    if $in_comment; then
      [[ "$line" == *"-->"* ]] || { line=""; break; }
      line=${line#*-->}; in_comment=false
    elif [[ "$line" == *"<!--"* ]]; then
      visible+=${line%%<!--*}; line=${line#*<!--}; in_comment=true
    else
      visible+=$line; line=""
    fi
  done
  if [[ "$visible" =~ ^[[:space:]]*Ships\ with:[[:space:]]*(Sefaria/)?(ai-chatbot|Sefaria-Project)#([0-9]+) ]]; then
    if [[ "${BASH_REMATCH[2]}" == ai-chatbot ]]; then repo=ai-chatbot; else repo=Sefaria-Project; fi
    echo "$repo#${BASH_REMATCH[3]}"
    exit 0
  fi
done <<< "$1"
