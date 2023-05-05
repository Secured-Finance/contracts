#!/usr/bin/env bash

FLATTENED_FOLDER=flattened
REPORT_FILE=secured-finance-mythril.md
TIMEOUT=60

rm -f $REPORT_FILE

for CONTRACT in $FLATTENED_FOLDER/*.sol; do
  printf "Processing $CONTRACT\n"
  myth a $CONTRACT --solv v0.8.9 -o markdown --execution-timeout $TIMEOUT >> $REPORT_FILE
  printf "Done $CONTRACT\n"
done

printf "\e[32m✔ Mythril analysis done, report file created: $REPORT_FILE.\e[0m\n"