#!/usr/bin/env bash
# cmd-wrapper.sh

grep() {
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --include=*)   args+=(-g "${1#--include=}"); shift ;;
      --include)     args+=(-g "$2"); shift 2 ;;
      -E|-r|-R)      shift ;;
      *)             args+=("$1"); shift ;;
    esac
  done
  rg --no-heading "${args[@]}"
}

find() {
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -type)    args+=(--type "$2"); shift 2 ;;
      -name)    args+=(--glob "$2"); shift 2 ;;
      -maxdepth) args+=(--max-depth "$2"); shift 2 ;;
      -path)    args+=(--full-path "$2"); shift 2 ;;
      *)        args+=("$1"); shift ;;
    esac
  done
  fd "${args[@]}"
}

ls() { eza --icons=never "$@"; }
cat() { bat --style=plain "$@"; }
export PATH="/opt/homebrew/bin:$PATH"
