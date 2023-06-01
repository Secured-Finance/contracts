#!/usr/bin/env bash

FLATTENED_FOLDER=flattened
REPORT_FOLDER=slither

rm -rf $REPORT_FOLDER
mkdir $REPORT_FOLDER

for CONTRACT in $FLATTENED_FOLDER/*.sol; do
  printf "Processing $CONTRACT\n"
  file_name=$(basename "${CONTRACT%.*}")
  slither $CONTRACT --solc-disable-warnings --exclude-informational --checklist --show-ignored-findings 2>&1 | cat > $REPORT_FOLDER/$file_name.md
done
