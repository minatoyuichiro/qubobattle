#!/bin/bash
# Run a job file with 4 parallel single-threaded workers; logs in results/logs/
cd "$(dirname "$0")/.."
PY=${PY:-../.venv/bin/python}
grep -v '^#' "$1" | sed "s#^python #$PY #" | while read -r line; do
  echo "$line"
done | xargs -P ${NPROC:-4} -I{} bash -c 'cmd="{}"; log=results/logs/$(echo "$cmd" | md5sum | cut -c1-8).log; echo "$cmd" > $log; $cmd >> $log 2>&1; echo "done: $cmd"'
